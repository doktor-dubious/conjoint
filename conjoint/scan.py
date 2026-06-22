"""Scan Var(alpha) statistics across a range of N for a fixed K."""

from typing import Iterator, List, Tuple

from .design import generate_design
from .variance import variance_stats


def _norm_undirected(directed_edges):
    return [(min(a, b), max(a, b)) for a, b in directed_edges]


def variance_scan(
    K: int,
    N_min: int,
    N_max: int,
    objective: str = "d-optimal",
    seed: int = 0,
    forbid_reverse: bool = False,
) -> List[dict]:
    """For each feasible N in [N_min, N_max], generate a design and return
    summary statistics. Infeasible values of N are skipped with a note.

    Returns:
        list of dicts with keys:
            N, residual_df, min_var, max_var, mean_var, ratio,
            spanning_trees, n_distinct_var, feasible, note
    """
    if N_min < K:
        raise ValueError(f"N_min must be >= K; got N_min={N_min}, K={K}")
    rows = []
    for N in range(N_min, N_max + 1):
        try:
            directed = generate_design(
                K, N, objective=objective, seed=seed,
                forbid_reverse=forbid_reverse,
            )
        except (ValueError, NotImplementedError) as e:
            rows.append({
                "N": N, "residual_df": N - K,
                "min_var": None, "max_var": None, "mean_var": None,
                "ratio": None, "spanning_trees": None, "n_distinct_var": None,
                "feasible": False, "note": str(e),
            })
            continue
        edges = _norm_undirected(directed)
        stats = variance_stats(K, edges)
        rows.append({
            "N": N,
            "residual_df": N - K,
            "min_var": round(stats["min"], 6),
            "max_var": round(stats["max"], 6),
            "mean_var": round(stats["mean"], 6),
            "ratio": round(stats["ratio"], 4),
            "spanning_trees": stats["spanning_trees"],
            "n_distinct_var": stats["n_distinct"],
            "feasible": True,
            "note": "",
        })
    return rows
