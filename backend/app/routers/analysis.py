"""OLS analysis endpoint."""

from typing import Dict, List, Tuple

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..analysis import aggregate_alphas, fit_respondent
from ..db import get_db
from ..models import Design, ObjectItem, Respondent, Response, Survey, Trial
from ..schemas import AlphaEstimate, AnalyzeResponse, RespondentAnalysis


router = APIRouter(prefix="/api/surveys", tags=["analysis"])


@router.post("/{survey_id}/analyze", response_model=AnalyzeResponse)
def analyze_survey(
    survey_id: int,
    design_id: int | None = None,
    db: Session = Depends(get_db),
) -> AnalyzeResponse:
    """Fit OLS per respondent and aggregate.

    If `design_id` is omitted, the latest design for the survey is used.
    Only respondents who answered at least K trials of the chosen design are
    fit; partial respondents are skipped (analyzable note in the future).
    """
    survey = db.get(Survey, survey_id)
    if not survey:
        raise HTTPException(404, "survey not found")

    # Pick design
    if design_id is None:
        stmt = (
            select(Design).where(Design.survey_id == survey_id)
            .order_by(Design.created_at.desc()).limit(1)
        )
        design = db.execute(stmt).scalar_one_or_none()
    else:
        design = db.get(Design, design_id)
        if design is None or design.survey_id != survey_id:
            raise HTTPException(404, "design not found for this survey")
    if design is None:
        raise HTTPException(400, "survey has no design yet")

    # Trial map: trial_id -> (left_position, right_position)
    objects = sorted(survey.objects, key=lambda o: o.position)
    pos_by_id: Dict[int, int] = {o.id: o.position for o in objects}
    name_by_pos: Dict[int, str] = {o.position: o.name for o in objects}
    id_by_pos: Dict[int, int] = {o.position: o.id for o in objects}
    trial_pairs: Dict[int, Tuple[int, int]] = {
        t.id: (pos_by_id[t.left_id], pos_by_id[t.right_id])
        for t in design.trials
    }

    # All respondents + responses for this survey/design
    stmt = (
        select(Respondent)
        .where(Respondent.survey_id == survey_id)
        .options(selectinload(Respondent.responses))
    )
    respondents = list(db.execute(stmt).scalars())

    K = survey.K
    per_respondent: List[RespondentAnalysis] = []
    valid_fits = []
    for r in respondents:
        rs = [resp for resp in r.responses if resp.trial_id in trial_pairs]
        if len(rs) < K:
            # not enough to fit
            continue
        trials = [trial_pairs[resp.trial_id] for resp in rs]
        y = [resp.y for resp in rs]
        fit = fit_respondent(K, trials, y)
        valid_fits.append(fit)

        alphas = []
        for pos in range(K):
            alpha_val = float(fit.alpha[pos])
            se = float(fit.alpha_se[pos]) if fit.alpha_se is not None else None
            alphas.append(AlphaEstimate(
                object_id=id_by_pos[pos],
                position=pos,
                name=name_by_pos[pos],
                alpha=alpha_val,
                se=se,
            ))
        per_respondent.append(RespondentAnalysis(
            respondent_id=r.id,
            external_id=r.external_id,
            n_responses=fit.n_responses,
            residual_df=fit.residual_df,
            sigma_hat=fit.sigma_hat,
            tau=fit.tau,
            tau_se=fit.tau_se,
            alphas=alphas,
        ))

    # Aggregate
    aggregate = None
    if valid_fits:
        agg = aggregate_alphas(valid_fits)
        if agg is not None:
            aggregate = [
                AlphaEstimate(
                    object_id=id_by_pos[pos],
                    position=pos,
                    name=name_by_pos[pos],
                    alpha=float(agg[pos]),
                    se=None,  # SE on aggregate would need a hierarchical model
                )
                for pos in range(K)
            ]

    return AnalyzeResponse(
        survey_id=survey_id,
        design_id=design.id,
        n_respondents=len(per_respondent),
        per_respondent=per_respondent,
        aggregate=aggregate,
    )
