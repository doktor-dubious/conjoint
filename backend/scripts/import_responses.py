"""Import historical respondent data into a test plan + survey.

Input CSV columns: Id, Index1, PSNY, left, right, yny
  - Id          -> Respondent.external_id (one respondent per distinct Id)
  - left, right -> 1-indexed object codes (1=Pernille, 2=Sisse, 3=Line)
  - yny         -> the bipolar/centered response on [-25, 25] (midpoint 0),
                   so raw_value = yny and y = yny - midpoint = yny.

The file *is* the design: a homogeneous K=3, N=3 triangle directed as a single
3-cycle  P->S, S->L, L->P  i.e. directed edges (0,1), (1,2), (2,0).

The importer is idempotent:
  - the test plan / survey are reused if a row with the canonical name exists
  - respondents are keyed by (survey_id, external_id)
  - responses are keyed by (respondent_id, trial_id)

Usage (inside the api container):
    python scripts/import_responses.py /tmp/rune.csv
"""

from __future__ import annotations

import csv
import sys
from collections import defaultdict

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Design, ObjectItem, Respondent, Response, Survey, Trial
from conjoint.variance import variance_stats

# ── Dataset-specific configuration ──────────────────────────────────────────
PLAN_NAME = "Kommunevalg triangle (K3 N3)"
SURVEY_NAME = "Kommunevalg (Rune 110-respondent)"
OBJECT_NAMES = ["Pernille", "Sisse", "Line"]   # positions 0, 1, 2
SCALE_MIN, SCALE_MAX = -25.0, 25.0
# directed edges as 0-indexed (left_pos, right_pos), in presentation order
EDGES = [(0, 1), (1, 2), (2, 0)]
K, N = 3, 3


def _make_design(survey: Survey, edges: list[tuple[int, int]]) -> Design:
    objs = sorted(survey.objects, key=lambda o: o.position)
    undirected = [(min(a, b), max(a, b)) for a, b in edges]
    stats = variance_stats(survey.K, undirected)
    return Design(
        survey_id=survey.id,
        objective="d-optimal", seed=0, max_iter=500,
        min_var=stats["min"], max_var=stats["max"], mean_var=stats["mean"],
        ratio=stats["ratio"], spanning_trees=stats["spanning_trees"],
        trials=[
            Trial(trial_number=t, left_id=objs[L].id, right_id=objs[R].id)
            for t, (L, R) in enumerate(edges, 1)
        ],
    )


def _design_for(db, survey_id: str) -> Design | None:
    return db.execute(
        select(Design).where(Design.survey_id == survey_id)
    ).scalars().first()


def get_or_create_test_plan(db) -> tuple[Survey, Design]:
    plan = db.execute(
        select(Survey).where(
            Survey.name == PLAN_NAME, Survey.source_test_plan_id.is_(None)
        )
    ).scalars().first()
    if plan:
        return plan, _design_for(db, plan.id)
    plan = Survey(
        name=PLAN_NAME, K=K, N=N,
        scale_min=SCALE_MIN, scale_max=SCALE_MAX, randomize_order=False,
        objects=[ObjectItem(position=i, name=f"O{i + 1}") for i in range(K)],
    )
    db.add(plan)
    db.flush()
    design = _make_design(plan, EDGES)
    db.add(design)
    db.flush()
    return plan, design


def get_or_create_survey(db, plan: Survey) -> tuple[Survey, Design]:
    survey = db.execute(
        select(Survey).where(
            Survey.name == SURVEY_NAME,
            Survey.source_test_plan_id == plan.id,
        )
    ).scalars().first()
    if survey:
        return survey, _design_for(db, survey.id)
    survey = Survey(
        name=SURVEY_NAME,
        description="Imported from kommunevalg_lodret_RUNE_NY.csv",
        K=plan.K, N=plan.N,
        scale_min=SCALE_MIN, scale_max=SCALE_MAX, randomize_order=False,
        source_test_plan_id=plan.id,
        objects=[
            ObjectItem(position=i, name=nm, text=nm)
            for i, nm in enumerate(OBJECT_NAMES)
        ],
    )
    db.add(survey)
    db.flush()
    design = _make_design(survey, EDGES)
    db.add(design)
    db.flush()
    return survey, design


def main(path: str) -> None:
    midpoint = (SCALE_MIN + SCALE_MAX) / 2.0

    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))

    db = SessionLocal()
    try:
        plan, _ = get_or_create_test_plan(db)
        survey, design = get_or_create_survey(db, plan)

        # (left_pos, right_pos) -> Trial for this survey's design
        pos_by_id = {o.id: o.position for o in survey.objects}
        trial_by_dir = {
            (pos_by_id[t.left_id], pos_by_id[t.right_id]): t
            for t in design.trials
        }

        existing = {
            r.external_id: r
            for r in db.execute(
                select(Respondent).where(Respondent.survey_id == survey.id)
            ).scalars()
        }

        by_id: dict[str, list[dict]] = defaultdict(list)
        for r in rows:
            by_id[r["Id"]].append(r)

        n_resp = n_response = skipped = 0
        for ext_id, rrows in by_id.items():
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
            for r in rrows:
                left = int(r["left"]) - 1
                right = int(r["right"]) - 1
                trial = trial_by_dir.get((left, right))
                if trial is None:
                    skipped += 1
                    continue
                if trial.id in done:
                    continue
                yny = float(r["yny"])
                db.add(Response(
                    respondent_id=resp.id, trial_id=trial.id,
                    raw_value=yny, y=yny - midpoint,
                ))
                n_response += 1

        db.commit()
        print(
            f"plan={plan.id}\nsurvey={survey.id}\n"
            f"respondents_added={n_resp} responses_added={n_response} "
            f"skipped={skipped} total_respondents={len(existing)}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/rune.csv")
