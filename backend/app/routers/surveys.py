"""Persistent endpoints: surveys, designs, respondents, responses."""

import csv
import io
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from conjoint.design import generate_design
from conjoint.variance import variance_stats

from ..db import get_db
from ..models import (
    Design, ObjectItem, Respondent, Response, Survey, Trial,
)
from ..schemas import (
    GenerateDesignRequest, ImportResult, ManualDesignRequest, RespondentCreate,
    RespondentOut, ResponseBatchSubmit, ResponseOut, StoredDesignOut,
    StoredTrialOut, SurveyCreate, SurveyDataRow, SurveyInstanceCreate, SurveyOut,
    SurveyUpdate,
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


@router.post(
    "/{test_plan_id}/instantiate",
    response_model=SurveyOut,
    status_code=201,
)
def instantiate_survey(
    test_plan_id: str,
    payload: SurveyInstanceCreate,
    db: Session = Depends(get_db),
) -> Survey:
    """Create an actual survey from a finalized test plan.

    Copies the plan's design and attaches concrete object definitions
    (text / description / image), matched to plan objects by position.
    """
    plan = db.get(Survey, test_plan_id)
    if not plan:
        raise HTTPException(404, "test plan not found")
    plan_objects = sorted(plan.objects, key=lambda o: o.position)

    design = db.execute(
        select(Design)
        .where(Design.survey_id == plan.id)
        .options(selectinload(Design.trials))
        .order_by(Design.created_at.desc())
    ).scalars().first()
    if not design:
        raise HTTPException(400, "test plan has no finalized design")

    defs = {d.position: d for d in payload.objects}

    survey = Survey(
        name=payload.name,
        description=payload.description,
        K=plan.K, N=plan.N,
        scale_min=plan.scale_min, scale_max=plan.scale_max,
        randomize_order=plan.randomize_order,
        source_test_plan_id=plan.id,
        objects=[
            ObjectItem(
                position=o.position,
                # Given name if provided, else keep the plan's generic name.
                name=(defs[o.position].name if defs.get(o.position) and defs[o.position].name else o.name),
                text=defs[o.position].text if o.position in defs else None,
                description=defs[o.position].description if o.position in defs else None,
                image=defs[o.position].image if o.position in defs else None,
            )
            for o in plan_objects
        ],
    )
    db.add(survey)
    db.flush()  # assign UUIDs to the new objects

    new_obj_by_pos = {o.position: o.id for o in survey.objects}
    plan_pos_by_id = {o.id: o.position for o in plan_objects}

    new_design = Design(
        survey_id=survey.id,
        objective=design.objective, seed=design.seed, max_iter=design.max_iter,
        min_var=design.min_var, max_var=design.max_var, mean_var=design.mean_var,
        ratio=design.ratio, spanning_trees=design.spanning_trees,
        trials=[
            Trial(
                trial_number=t.trial_number,
                left_id=new_obj_by_pos[plan_pos_by_id[t.left_id]],
                right_id=new_obj_by_pos[plan_pos_by_id[t.right_id]],
            )
            for t in sorted(design.trials, key=lambda x: x.trial_number)
        ],
    )
    db.add(new_design)
    db.commit()
    db.refresh(survey)
    return survey


@router.get("", response_model=list[SurveyOut])
def list_surveys(
    test_plan: bool | None = None,
    db: Session = Depends(get_db),
) -> list[Survey]:
    """List surveys.

    test_plan=True  -> only reusable test plans (no source_test_plan_id)
    test_plan=False -> only actual surveys (instantiated from a test plan)
    omitted         -> everything
    """
    stmt = (
        select(Survey)
        .options(selectinload(Survey.objects))
        .order_by(Survey.created_at.desc())
    )
    if test_plan is True:
        stmt = stmt.where(Survey.source_test_plan_id.is_(None))
    elif test_plan is False:
        stmt = stmt.where(Survey.source_test_plan_id.is_not(None))
    return list(db.execute(stmt).scalars().all())


@router.get("/{survey_id}", response_model=SurveyOut)
def get_survey(survey_id: str, db: Session = Depends(get_db)) -> Survey:
    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(404, "survey not found")
    return survey


@router.patch("/{survey_id}", response_model=SurveyOut)
def update_survey(
    survey_id: str,
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
def delete_survey(survey_id: str, db: Session = Depends(get_db)) -> None:
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
    survey_id: str,
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
    survey_id: str,
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
def list_designs(survey_id: str, db: Session = Depends(get_db)) -> list[StoredDesignOut]:
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
    survey_id: str,
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
def list_respondents(survey_id: str, db: Session = Depends(get_db)) -> list[Respondent]:
    return list(
        db.execute(
            select(Respondent).where(Respondent.survey_id == survey_id)
        ).scalars()
    )


@router.get("/{survey_id}/responses", response_model=list[SurveyDataRow])
def list_survey_responses(
    survey_id: str, db: Session = Depends(get_db),
) -> list[SurveyDataRow]:
    """All collected/imported responses for a survey, flattened with the
    respondent's external id and the comparison's object names/positions."""
    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(404, "survey not found")
    obj = {o.id: o for o in survey.objects}
    rows = db.execute(
        select(
            Response.id, Response.respondent_id, Response.raw_value, Response.y,
            Response.recorded_at, Respondent.external_id,
            Trial.trial_number, Trial.left_id, Trial.right_id,
        )
        .join(Respondent, Response.respondent_id == Respondent.id)
        .join(Trial, Response.trial_id == Trial.id)
        .where(Respondent.survey_id == survey_id)
        .order_by(Respondent.external_id, Trial.trial_number)
    ).all()
    out: list[SurveyDataRow] = []
    for r_id, resp_id, raw, y, rec, ext, tnum, left_id, right_id in rows:
        lo = obj.get(left_id)
        ro = obj.get(right_id)
        out.append(SurveyDataRow(
            id=r_id, respondent_id=resp_id, external_id=ext, trial_number=tnum,
            left_position=lo.position if lo else -1,
            right_position=ro.position if ro else -1,
            left_name=lo.name if lo else "?",
            right_name=ro.name if ro else "?",
            raw_value=raw, y=y, recorded_at=rec,
        ))
    return out


@router.post("/{survey_id}/responses/import", response_model=ImportResult)
def import_responses(
    survey_id: str,
    file: UploadFile = File(...),
    id_column: str = Form("Id"),
    left_column: str = Form("left"),
    right_column: str = Form("right"),
    value_column: str = Form("yny"),
    one_indexed: bool = Form(True),
    db: Session = Depends(get_db),
) -> ImportResult:
    """Import respondent responses for an existing survey from a CSV.

    Each row carries a respondent id, the left/right object *positions* of one
    comparison, and the slider value. Rows are matched to the survey's design
    trials by comparison direction. The value is stored as raw_value, with
    y = raw_value - midpoint. Idempotent: respondents are keyed by external_id,
    responses by (respondent, trial).
    """
    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(404, "survey not found")
    design = db.execute(
        select(Design)
        .where(Design.survey_id == survey.id)
        .options(selectinload(Design.trials))
        .order_by(Design.created_at.desc())
    ).scalars().first()
    if not design:
        raise HTTPException(400, "survey has no design to import against")

    try:
        text = file.file.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "file must be UTF-8 encoded text/CSV")
    reader = csv.DictReader(io.StringIO(text))
    cols = reader.fieldnames or []
    missing = [
        c for c in (id_column, left_column, right_column, value_column)
        if c not in cols
    ]
    if missing:
        raise HTTPException(
            400, f"missing column(s) {missing}; found {cols}",
        )

    pos_by_id = {o.id: o.position for o in survey.objects}
    # (left_pos, right_pos) -> trial. Note: ambiguous if a direction repeats.
    trial_by_dir: dict[tuple[int, int], Trial] = {}
    for t in design.trials:
        trial_by_dir[(pos_by_id[t.left_id], pos_by_id[t.right_id])] = t
    repeats = len(trial_by_dir) < len(design.trials)

    midpoint = (survey.scale_min + survey.scale_max) / 2.0
    shift = 1 if one_indexed else 0

    existing = {
        r.external_id: r
        for r in db.execute(
            select(Respondent).where(Respondent.survey_id == survey.id)
        ).scalars()
    }

    by_id: dict[str, list[dict]] = defaultdict(list)
    for row in reader:
        by_id[(row.get(id_column) or "").strip()].append(row)

    errors: list[str] = []
    n_resp = n_response = skipped = 0

    for ext_id, rows in by_id.items():
        if not ext_id:
            skipped += len(rows)
            if len(errors) < 20:
                errors.append("row(s) with empty id skipped")
            continue
        resp = existing.get(ext_id)
        if resp is None:
            resp = Respondent(survey_id=survey.id, external_id=ext_id)
            db.add(resp)
            db.flush()
            existing[ext_id] = resp
            n_resp += 1
        done = {
            x.trial_id
            for x in db.execute(
                select(Response).where(Response.respondent_id == resp.id)
            ).scalars()
        }
        for row in rows:
            try:
                left = int(row[left_column]) - shift
                right = int(row[right_column]) - shift
                raw = float(row[value_column])
            except (TypeError, ValueError):
                skipped += 1
                if len(errors) < 20:
                    errors.append(f"id {ext_id}: unparseable row {dict(row)}")
                continue
            trial = trial_by_dir.get((left, right))
            if trial is None:
                skipped += 1
                if len(errors) < 20:
                    errors.append(
                        f"id {ext_id}: no trial for direction "
                        f"({left + shift},{right + shift})",
                    )
                continue
            if not (survey.scale_min <= raw <= survey.scale_max):
                skipped += 1
                if len(errors) < 20:
                    errors.append(
                        f"id {ext_id}: value {raw} outside scale "
                        f"[{survey.scale_min}, {survey.scale_max}]",
                    )
                continue
            if trial.id in done:
                continue
            db.add(Response(
                respondent_id=resp.id, trial_id=trial.id,
                raw_value=raw, y=raw - midpoint,
            ))
            done.add(trial.id)
            n_response += 1

    if repeats and len(errors) < 20:
        errors.append(
            "warning: design repeats a comparison direction; rows were matched "
            "to one such trial — verify if your design has indirect repetitions",
        )

    db.commit()

    total_responses = db.execute(
        select(Response)
        .join(Respondent, Response.respondent_id == Respondent.id)
        .where(Respondent.survey_id == survey.id)
    ).scalars().all()

    return ImportResult(
        respondents_added=n_resp,
        responses_added=n_response,
        skipped=skipped,
        total_respondents=len(existing),
        total_responses=len(total_responses),
        errors=errors,
    )


# ---------- Responses ----------

resp_router = APIRouter(prefix="/api/respondents", tags=["responses"])


@resp_router.post(
    "/{respondent_id}/responses",
    response_model=list[ResponseOut],
    status_code=201,
)
def submit_responses(
    respondent_id: str,
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
