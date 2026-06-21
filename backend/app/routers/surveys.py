"""Persistent endpoints: surveys, designs, respondents, responses."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from conjoint.design import generate_design
from conjoint.variance import variance_stats

from ..db import get_db
from ..models import (
    Design, ObjectItem, Respondent, Response, Survey, Trial,
)
from ..schemas import (
    GenerateDesignRequest, ManualDesignRequest, RespondentCreate, RespondentOut,
    ResponseBatchSubmit, ResponseOut, StoredDesignOut, StoredTrialOut,
    SurveyCreate, SurveyOut, SurveyUpdate,
)


router = APIRouter(prefix="/api/surveys", tags=["surveys"])


# ---------- Surveys ----------

@router.post("", response_model=SurveyOut, status_code=201)
def create_survey(payload: SurveyCreate, db: Session = Depends(get_db)) -> Survey:
    if len(payload.object_names) != payload.K:
        raise HTTPException(400, f"object_names length must equal K={payload.K}")
    if payload.scale_min >= payload.scale_max:
        raise HTTPException(400, "scale_min must be < scale_max")
    survey = Survey(
        name=payload.name,
        description=payload.description,
        K=payload.K, N=payload.N,
        scale_min=payload.scale_min, scale_max=payload.scale_max,
        randomize_order=payload.randomize_order,
        objects=[
            ObjectItem(position=i, name=name)
            for i, name in enumerate(payload.object_names)
        ],
    )
    db.add(survey)
    db.commit()
    db.refresh(survey)
    return survey


@router.get("", response_model=list[SurveyOut])
def list_surveys(db: Session = Depends(get_db)) -> list[Survey]:
    stmt = (
        select(Survey)
        .options(selectinload(Survey.objects))
        .order_by(Survey.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


@router.get("/{survey_id}", response_model=SurveyOut)
def get_survey(survey_id: int, db: Session = Depends(get_db)) -> Survey:
    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(404, "survey not found")
    return survey


@router.patch("/{survey_id}", response_model=SurveyOut)
def update_survey(
    survey_id: int,
    payload: SurveyUpdate,
    db: Session = Depends(get_db),
) -> Survey:
    """Update editable test-plan metadata (name, description)."""
    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(404, "survey not found")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, "name cannot be empty")
        survey.name = name
    if payload.description is not None:
        survey.description = payload.description or None
    db.commit()
    db.refresh(survey)
    return survey


@router.delete("/{survey_id}", status_code=204)
def delete_survey(survey_id: int, db: Session = Depends(get_db)) -> None:
    """Delete a test plan (survey + its objects, designs and trials).

    Refused with 409 if the plan has already been used to collect data
    (it has respondents), so finalized results are never silently lost.
    """
    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(404, "survey not found")
    if survey.respondents:
        raise HTTPException(
            409,
            "test plan has respondents and cannot be deleted",
        )
    db.delete(survey)
    db.commit()


# ---------- Designs ----------

@router.post("/{survey_id}/design", response_model=StoredDesignOut, status_code=201)
def generate_and_store_design(
    survey_id: int,
    req: GenerateDesignRequest,
    db: Session = Depends(get_db),
) -> StoredDesignOut:
    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(404, "survey not found")
    objects = sorted(survey.objects, key=lambda o: o.position)
    if len(objects) != survey.K:
        raise HTTPException(500, "survey has wrong number of objects")

    try:
        directed = generate_design(
            K=survey.K, N=survey.N, objective=req.objective,
            seed=req.seed, max_iter=req.max_iter,
        )
    except (ValueError, NotImplementedError) as e:
        raise HTTPException(400, str(e))

    undirected = [(min(a, b), max(a, b)) for a, b in directed]
    stats = variance_stats(survey.K, undirected)

    design = Design(
        survey_id=survey.id,
        objective=req.objective,
        seed=req.seed,
        max_iter=req.max_iter,
        min_var=stats["min"], max_var=stats["max"], mean_var=stats["mean"],
        ratio=stats["ratio"], spanning_trees=stats["spanning_trees"],
        trials=[
            Trial(
                trial_number=t,
                left_id=objects[L].id,
                right_id=objects[R].id,
            )
            for t, (L, R) in enumerate(directed, 1)
        ],
    )
    db.add(design)
    db.commit()
    db.refresh(design)

    name_by_id = {o.id: o.name for o in objects}
    return StoredDesignOut(
        id=design.id, survey_id=design.survey_id,
        objective=design.objective, seed=design.seed,
        max_iter=design.max_iter,
        min_var=design.min_var, max_var=design.max_var,
        mean_var=design.mean_var, ratio=design.ratio,
        spanning_trees=design.spanning_trees,
        created_at=design.created_at,
        trials=[
            StoredTrialOut(
                id=t.id, trial_number=t.trial_number,
                left_id=t.left_id, right_id=t.right_id,
                left_name=name_by_id[t.left_id],
                right_name=name_by_id[t.right_id],
            )
            for t in sorted(design.trials, key=lambda x: x.trial_number)
        ],
    )


@router.post(
    "/{survey_id}/design/manual",
    response_model=StoredDesignOut,
    status_code=201,
)
def store_manual_design(
    survey_id: int,
    req: ManualDesignRequest,
    db: Session = Depends(get_db),
) -> StoredDesignOut:
    """Persist a design with an explicit, caller-supplied comparison order.

    Reordering rows leaves X'X unchanged, so the design is statistically
    identical to the seed-generated one — only the presentation order differs.
    """
    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(404, "survey not found")
    objects = sorted(survey.objects, key=lambda o: o.position)
    if len(objects) != survey.K:
        raise HTTPException(500, "survey has wrong number of objects")

    directed = [(int(L), int(R)) for L, R in req.edges]
    for L, R in directed:
        if not (0 <= L < survey.K and 0 <= R < survey.K) or L == R:
            raise HTTPException(400, f"invalid edge ({L}, {R}) for K={survey.K}")

    undirected = [(min(a, b), max(a, b)) for a, b in directed]
    stats = variance_stats(survey.K, undirected)

    design = Design(
        survey_id=survey.id,
        objective=req.objective,
        seed=req.seed,
        max_iter=req.max_iter,
        min_var=stats["min"], max_var=stats["max"], mean_var=stats["mean"],
        ratio=stats["ratio"], spanning_trees=stats["spanning_trees"],
        trials=[
            Trial(
                trial_number=t,
                left_id=objects[L].id,
                right_id=objects[R].id,
            )
            for t, (L, R) in enumerate(directed, 1)
        ],
    )
    db.add(design)
    db.commit()
    db.refresh(design)

    name_by_id = {o.id: o.name for o in objects}
    return StoredDesignOut(
        id=design.id, survey_id=design.survey_id,
        objective=design.objective, seed=design.seed,
        max_iter=design.max_iter,
        min_var=design.min_var, max_var=design.max_var,
        mean_var=design.mean_var, ratio=design.ratio,
        spanning_trees=design.spanning_trees,
        created_at=design.created_at,
        trials=[
            StoredTrialOut(
                id=t.id, trial_number=t.trial_number,
                left_id=t.left_id, right_id=t.right_id,
                left_name=name_by_id[t.left_id],
                right_name=name_by_id[t.right_id],
            )
            for t in sorted(design.trials, key=lambda x: x.trial_number)
        ],
    )


@router.get("/{survey_id}/designs", response_model=list[StoredDesignOut])
def list_designs(survey_id: int, db: Session = Depends(get_db)) -> list[StoredDesignOut]:
    stmt = (
        select(Design)
        .where(Design.survey_id == survey_id)
        .options(selectinload(Design.trials))
        .order_by(Design.created_at.desc())
    )
    designs = db.execute(stmt).scalars().all()
    if not designs:
        survey = db.get(Survey, survey_id)
        if not survey:
            raise HTTPException(404, "survey not found")
    # Build name lookup
    object_ids = {t.left_id for d in designs for t in d.trials} | \
                 {t.right_id for d in designs for t in d.trials}
    name_by_id = {
        o.id: o.name
        for o in db.execute(select(ObjectItem).where(ObjectItem.id.in_(object_ids))).scalars()
    }
    return [
        StoredDesignOut(
            id=d.id, survey_id=d.survey_id,
            objective=d.objective, seed=d.seed,
            max_iter=d.max_iter,
            min_var=d.min_var, max_var=d.max_var, mean_var=d.mean_var,
            ratio=d.ratio, spanning_trees=d.spanning_trees,
            created_at=d.created_at,
            trials=[
                StoredTrialOut(
                    id=t.id, trial_number=t.trial_number,
                    left_id=t.left_id, right_id=t.right_id,
                    left_name=name_by_id[t.left_id],
                    right_name=name_by_id[t.right_id],
                )
                for t in sorted(d.trials, key=lambda x: x.trial_number)
            ],
        )
        for d in designs
    ]


# ---------- Respondents ----------

@router.post("/{survey_id}/respondents", response_model=RespondentOut, status_code=201)
def create_respondent(
    survey_id: int,
    payload: RespondentCreate,
    db: Session = Depends(get_db),
) -> Respondent:
    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(404, "survey not found")
    respondent = Respondent(
        survey_id=survey_id, external_id=payload.external_id,
    )
    db.add(respondent)
    db.commit()
    db.refresh(respondent)
    return respondent


@router.get("/{survey_id}/respondents", response_model=list[RespondentOut])
def list_respondents(survey_id: int, db: Session = Depends(get_db)) -> list[Respondent]:
    return list(
        db.execute(
            select(Respondent).where(Respondent.survey_id == survey_id)
        ).scalars()
    )


# ---------- Responses ----------

resp_router = APIRouter(prefix="/api/respondents", tags=["responses"])


@resp_router.post(
    "/{respondent_id}/responses",
    response_model=list[ResponseOut],
    status_code=201,
)
def submit_responses(
    respondent_id: int,
    payload: ResponseBatchSubmit,
    db: Session = Depends(get_db),
) -> list[ResponseOut]:
    respondent = db.get(Respondent, respondent_id)
    if not respondent:
        raise HTTPException(404, "respondent not found")
    survey = db.get(Survey, respondent.survey_id)
    midpoint = (survey.scale_min + survey.scale_max) / 2.0

    out: list[Response] = []
    trial_ids = {r.trial_id for r in payload.responses}
    trials = {
        t.id: t for t in
        db.execute(select(Trial).where(Trial.id.in_(trial_ids))).scalars()
    }
    for r in payload.responses:
        if r.trial_id not in trials:
            raise HTTPException(400, f"trial {r.trial_id} not found")
        if not (survey.scale_min <= r.raw_value <= survey.scale_max):
            raise HTTPException(
                400,
                f"raw_value {r.raw_value} outside scale "
                f"[{survey.scale_min}, {survey.scale_max}]",
            )
        out.append(Response(
            respondent_id=respondent_id,
            trial_id=r.trial_id,
            raw_value=r.raw_value,
            y=r.raw_value - midpoint,
        ))
    db.add_all(out)
    respondent.completed_at = datetime.now(timezone.utc)
    db.commit()
    for r in out:
        db.refresh(r)
    return out
