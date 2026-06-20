"""Variance statistics for a paired-comparison design.

Model (per respondent, under H1):
    y_k = alpha_R(k) - alpha_L(k) + tau + epsilon_k
With sum-to-zero on alpha and tau orthogonal to alpha (which holds when each
object has #right == #left), the OLS covariance of alpha is sigma^2 * L^+
where L is the graph Laplacian D - A of the underlying multi-graph.
"""

from fractions import Fraction
from typing import Dict, Iterable, List, Tuple

from ._linalg import inv, det


Edge = Tuple[int, int]


def laplacian(K: int, edges: Iterable[Edge]) -> List[List[Fraction]]:
    """Build the Laplacian L = D - A of the comparison multi-graph on K vertices.

    Edges are unordered pairs (i, j) with i, j in 0..K-1. Multi-edges (same pair
    appearing more than once) are summed.
    """
    L = [[Fraction(0)] * K for _ in range(K)]
    for i, j in edges:
        if i == j:
            raise ValueError(f"self-comparison not allowed: ({i}, {j})")
        L[i][j] -= 1
        L[j][i] -= 1
        L[i][i] += 1
        L[j][j] += 1
    return L


def is_connected(K: int, edges: Iterable[Edge]) -> bool:
    adj: Dict[int, List[int]] = {i: [] for i in range(K)}
    for i, j in edges:
        adj[i].append(j)
        adj[j].append(i)
    seen = {0}
    stack = [0]
    while stack:
        v = stack.pop()
        for w in adj[v]:
            if w not in seen:
                seen.add(w)
                stack.append(w)
    return len(seen) == K


def pseudoinverse_diag(K: int, edges: Iterable[Edge]) -> List[Fraction]:
    """Return the diagonal of L^+, equal to Var(alpha_i)/sigma^2 under
    sum-to-zero. Uses L^+ = (L + J/K)^{-1} - J/K^2 for the connected case.
    """
    edges = list(edges)
    if not is_connected(K, edges):
        raise ValueError("graph is disconnected; alpha not fully identified")
    L = laplacian(K, edges)
    one_over_K = Fraction(1, K)
    one_over_K2 = Fraction(1, K * K)
    LpJ = [[L[i][j] + one_over_K for j in range(K)] for i in range(K)]
    LpJ_inv = inv(LpJ)
    return [LpJ_inv[i][i] - one_over_K2 for i in range(K)]


def spanning_tree_count(K: int, edges: Iterable[Edge]) -> int:
    """Number of spanning trees of the multi-graph; equals det of any (K-1)x(K-1)
    principal minor of L (Matrix-Tree theorem). This is the standard D-criterion
    for the sum-to-zero parameterization.
    """
    L = laplacian(K, edges)
    minor = [row[:-1] for row in L[:-1]]
    return int(det(minor))


def variance_stats(K: int, edges: Iterable[Edge]) -> Dict[str, float]:
    """Compute summary statistics on Var(alpha_i)/sigma^2 for a given design.

    Returns: {'min', 'max', 'mean', 'ratio', 'spanning_trees', 'n_distinct'}
    """
    edges = list(edges)
    diag = pseudoinverse_diag(K, edges)
    fdiag = [float(v) for v in diag]
    distinct = len({round(float(v), 10) for v in diag})
    return {
        "min": min(fdiag),
        "max": max(fdiag),
        "mean": sum(fdiag) / K,
        "ratio": max(fdiag) / min(fdiag),
        "spanning_trees": spanning_tree_count(K, edges),
        "n_distinct": distinct,
    }
