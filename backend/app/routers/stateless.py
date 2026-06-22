"""Stateless design + scan endpoints. No database; pure call into `conjoint`."""

from fastapi import APIRouter, HTTPException

from conjoint.design import generate_design
from conjoint.scan import variance_scan
from conjoint.variance import variance_stats

from ..schemas import (
    DesignRequest, DesignResponse, DesignSummary, ScanRequest, ScanResponse,
    ScanRow, Trial,
)


router = APIRouter(prefix="/api", tags=["stateless"])


def _name(i: int, K: int, names: list[str] | None) -> str:
    if names:
        return names[i]
    width = max(2, len(str(K)))
    return f"Obj_{i + 1:0{width}d}"


@router.post("/design", response_model=DesignResponse)
def design(req: DesignRequest) -> DesignResponse:
    if req.object_names is not None and len(req.object_names) != req.K:
        raise HTTPException(400, f"object_names length must equal K={req.K}")
    try:
        directed = generate_design(
            K=req.K, N=req.N, objective=req.objective,
            seed=req.seed, max_iter=req.max_iter,
            forbid_reverse=req.forbid_reverse,
        )
    except (ValueError, NotImplementedError) as e:
        raise HTTPException(400, str(e))

    undirected = [(min(a, b), max(a, b)) for a, b in directed]
    stats = variance_stats(req.K, undirected)
    trials = []
    for t, (L, R) in enumerate(directed, 1):
        lo, hi = (L, R) if L < R else (R, L)
        trials.append(Trial(
            trial=t,
            left=_name(L, req.K, req.object_names),
            right=_name(R, req.K, req.object_names),
            pair=f"{lo + 1:02d}-{hi + 1:02d}",
        ))
    summary = DesignSummary(
        K=req.K, N=req.N, residual_df=req.N - req.K,
        objective=req.objective,
        min_var=stats["min"], max_var=stats["max"], mean_var=stats["mean"],
        ratio=stats["ratio"], spanning_trees=stats["spanning_trees"],
        n_distinct_var=stats["n_distinct"],
    )
    return DesignResponse(summary=summary, trials=trials)


@router.post("/scan", response_model=ScanResponse)
def scan(req: ScanRequest) -> ScanResponse:
    if req.N_min < req.K:
        raise HTTPException(400, f"N_min must be >= K; got {req.N_min} < {req.K}")
    if req.N_max < req.N_min:
        raise HTTPException(400, "N_max must be >= N_min")
    rows = variance_scan(
        K=req.K, N_min=req.N_min, N_max=req.N_max,
        objective=req.objective, seed=req.seed,
        forbid_reverse=req.forbid_reverse,
    )
    return ScanResponse(
        K=req.K, objective=req.objective,
        rows=[ScanRow(**r) for r in rows],
    )
