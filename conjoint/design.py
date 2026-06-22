"""Generate a directed paired-comparison design.

Algorithm:
    1. Build the most balanced all-even degree distribution.
    2. Seed with a Hamiltonian cycle + symmetric chord edges.
    3. Local 2-swap search to improve the objective (D-optimal or min-max-var).
    4. Eulerian orientation so each vertex has #left == #right -> tau ⊥ alpha.
"""

import random
from typing import Dict, Iterable, List, Optional, Set, Tuple

from .variance import (
    is_connected,
    pseudoinverse_diag,
    spanning_tree_count,
    variance_stats,
)


UndirectedEdge = Tuple[int, int]   # (i, j) with i < j; multi-graph allowed
DirectedEdge = Tuple[int, int]     # (left, right)


class InfeasibleDesign(ValueError):
    """No design exists for the requested (K, N) under the given constraints."""


# ---------- helpers ----------

def _norm(e: UndirectedEdge) -> UndirectedEdge:
    a, b = e
    return (a, b) if a < b else (b, a)


def _multiset_count(edges: Iterable[UndirectedEdge]) -> Dict[UndirectedEdge, int]:
    out: Dict[UndirectedEdge, int] = {}
    for e in edges:
        e = _norm(e)
        out[e] = out.get(e, 0) + 1
    return out


def _degrees(K: int, edges: Iterable[UndirectedEdge]) -> List[int]:
    deg = [0] * K
    for i, j in edges:
        deg[i] += 1
        deg[j] += 1
    return deg


def _all_even(deg: List[int]) -> bool:
    return all(d > 0 and d % 2 == 0 for d in deg)


# ---------- target degree distribution ----------

def target_degrees(K: int, N: int) -> List[int]:
    """Most balanced all-even degree sequence: 16 vertices, 40 total appearances
    -> twelve 2's and four 4's, etc. Returns sequence sorted ascending.
    """
    if N < K:
        raise ValueError(f"need N >= K; got N={N}, K={K}")
    deg = [2] * K
    excess = 2 * N - 2 * K  # extra degree, always even
    # distribute +2 increments round-robin starting from vertex 0
    i = 0
    while excess > 0:
        deg[i] += 2
        excess -= 2
        i = (i + 1) % K
    return sorted(deg)


# ---------- seed graph ----------

def _chord_cycle(K: int, length: int) -> List[UndirectedEdge]:
    """Closed cycle of `length` chord edges on `length` evenly-spaced hubs.

    length == 2 produces a multi-edge (doubled chord) between 2 vertices.
    Each hub gains exactly +2 chord-degree.
    """
    if length < 2:
        raise ValueError("chord cycle needs length >= 2")
    hub_step = max(1, K // length)
    hubs = [(i * hub_step) % K for i in range(length)]
    return [_norm((hubs[i % length], hubs[(i + 1) % length]))
            for i in range(length)]


def _special_K_plus_1(K: int) -> List[UndirectedEdge]:
    """Whole graph for N = K+1: a (K-1)-cycle on vertices {0..K-2} plus a
    doubled edge {0, K-1}. Total K+1 edges, all degrees even (one vertex has
    degree 4, all others degree 2). Connected. Used as seed; local search
    will reshape further.
    """
    if K < 3:
        raise ValueError("N=K+1 construction requires K >= 3")
    edges = [_norm((i, (i + 1) % (K - 1))) for i in range(K - 1)]
    edges += [_norm((0, K - 1)), _norm((0, K - 1))]
    return edges


def _chord_subgraph(K: int, n_edges: int) -> List[UndirectedEdge]:
    """Build a chord subgraph on K vertices with `n_edges` edges, every vertex
    even-degree. Used in combination with a Hamiltonian cycle base.

    For n_edges in [2, K]: a single chord cycle on `n_edges` hubs.
    For n_edges > K: a full chord K-cycle (with offset 2 to differ from the
    Hamiltonian) plus recursion on the remainder.
    n_edges == K+1 is delegated to a special (K-1)-cycle + doubled edge form
    that fits inside the chord layer.
    """
    if n_edges == 0:
        return []
    if n_edges == 1:
        raise ValueError("chord subgraph cannot have exactly 1 edge "
                         "(would produce odd degrees)")
    if n_edges <= K:
        return _chord_cycle(K, n_edges)
    if n_edges == K + 1:
        # Same shape as _special_K_plus_1 but used as a chord layer
        edges = [_norm((i, (i + 1) % (K - 1))) for i in range(K - 1)]
        edges += [_norm((0, K - 1)), _norm((0, K - 1))]
        return edges
    # n_edges in [K+2, ...]
    offset = 2 if K >= 5 else 1  # K=3,4 fall back to doubling the Hamiltonian
    layer = [_norm((i, (i + offset) % K)) for i in range(K)]
    return layer + _chord_subgraph(K, n_edges - K)


def _seed_graph(K: int, N: int) -> List[UndirectedEdge]:
    """Seed graph for the local search.

    extra = 0 -> Hamiltonian cycle (N = K).
    extra = 1 -> special (K-1)-cycle + doubled edge (whole graph).
    extra >= 2 -> Hamiltonian + chord subgraph with `extra` edges.

    Supports N up to roughly 3K (recursion depth + structural constraints).
    """
    extra = N - K
    if extra < 0:
        raise ValueError(f"need N >= K; got N={N}, K={K}")

    if extra == 0:
        return [_norm((i, (i + 1) % K)) for i in range(K)]
    if extra == 1:
        return _special_K_plus_1(K)
    # extra >= 2
    ham = [_norm((i, (i + 1) % K)) for i in range(K)]
    chord = _chord_subgraph(K, extra)
    return ham + chord


# ---------- simple (reverse-free) seed ----------
#
# Forbidding "reverse pairs" — the same unordered pair {A,B} used in both
# directions (A->B and B->A) — means the undirected comparison graph must be
# *simple* (every pair at most once). A valid design then needs a connected,
# all-even-degree simple graph on K vertices with exactly N edges, which only
# exists for some (K, N): each degree is even and <= K-1, so e.g. K=4 only
# admits N=4 (the 4-cycle); N=5, 6 are impossible.


def _max_even_degree(K: int) -> int:
    m = K - 1
    return m if m % 2 == 0 else m - 1


def _simple_even_degree_seq(K: int, N: int) -> List[int]:
    """Balanced all-even degree sequence (each <= K-1) summing to 2N."""
    cap = _max_even_degree(K)
    if cap < 2:
        raise InfeasibleDesign(
            f"K={K} is too small for a reverse-free design (need K >= 3)."
        )
    max_edges = K * cap // 2
    if N > max_edges:
        raise InfeasibleDesign(
            f"reverse-free design impossible for K={K}, N={N}: at most "
            f"{max_edges} comparisons are possible without reusing a pair "
            f"in both directions."
        )
    deg = [2] * K
    excess = 2 * N - 2 * K  # even, >= 0
    i = 0
    guard = 0
    while excess > 0:
        if deg[i] < cap:
            deg[i] += 2
            excess -= 2
        i = (i + 1) % K
        guard += 1
        if guard > 4 * K * K:  # safety; should never trigger after the cap check
            raise InfeasibleDesign(
                f"reverse-free design impossible for K={K}, N={N}."
            )
    return deg


def _havel_hakimi(degrees: List[int]) -> Optional[List[UndirectedEdge]]:
    """Build a simple graph realising `degrees`, or None if not graphical."""
    nodes = [[d, v] for v, d in enumerate(degrees)]
    edges: List[UndirectedEdge] = []
    while True:
        nodes.sort(key=lambda x: -x[0])
        if nodes[0][0] == 0:
            return edges
        d0, v0 = nodes[0][0], nodes[0][1]
        nodes[0][0] = 0
        if d0 > len(nodes) - 1:
            return None
        for k in range(1, d0 + 1):
            if nodes[k][0] <= 0:
                return None
            nodes[k][0] -= 1
            a, b = v0, nodes[k][1]
            edges.append((min(a, b), max(a, b)))


def _components(K: int, edges: List[UndirectedEdge]) -> List[Set[int]]:
    adj: Dict[int, Set[int]] = {v: set() for v in range(K)}
    for a, b in edges:
        adj[a].add(b)
        adj[b].add(a)
    seen: Set[int] = set()
    comps: List[Set[int]] = []
    for start in range(K):
        if start in seen:
            continue
        comp: Set[int] = set()
        stack = [start]
        while stack:
            v = stack.pop()
            if v in comp:
                continue
            comp.add(v)
            stack.extend(adj[v] - comp)
        seen |= comp
        comps.append(comp)
    return comps


def _make_connected(
    K: int, edges: List[UndirectedEdge]
) -> Optional[List[UndirectedEdge]]:
    """Merge components with degree-preserving simple 2-swaps."""
    edges = list(edges)
    for _ in range(2 * K * K):
        comps = _components(K, edges)
        if len(comps) <= 1:
            return edges
        a_set, b_set = comps[0], comps[1]
        eset = set(edges)
        done = False
        for ia, (a, b) in enumerate(edges):
            if not (a in a_set and b in a_set):
                continue
            for ib, (c, d) in enumerate(edges):
                if ia == ib or not (c in b_set and d in b_set):
                    continue
                for (na, nb), (nc, nd) in (((a, c), (b, d)), ((a, d), (b, c))):
                    if na == nb or nc == nd:
                        continue
                    n1 = (min(na, nb), max(na, nb))
                    n2 = (min(nc, nd), max(nc, nd))
                    if n1 == n2 or n1 in eset or n2 in eset:
                        continue
                    edges[ia], edges[ib] = n1, n2
                    done = True
                    break
                if done:
                    break
            if done:
                break
        if not done:
            return None
    return None


def _simple_seed(K: int, N: int) -> List[UndirectedEdge]:
    deg = _simple_even_degree_seq(K, N)
    edges = _havel_hakimi(deg)
    if edges is None:
        raise InfeasibleDesign(
            f"reverse-free design impossible for K={K}, N={N}."
        )
    edges = _make_connected(K, edges)
    if edges is None:
        raise InfeasibleDesign(
            f"reverse-free design impossible for K={K}, N={N}: cannot connect "
            f"a simple all-even graph with that many comparisons."
        )
    return edges


# ---------- objective ----------

def _objective(K: int, edges: List[UndirectedEdge], objective: str) -> Tuple:
    """Return a sort key where smaller is better."""
    diag = pseudoinverse_diag(K, edges)
    if objective == "d-optimal":
        # maximize spanning_tree_count = minimize its negation
        st = spanning_tree_count(K, edges)
        return (-st, max(diag), sum(diag))
    elif objective == "min-max-var":
        return (max(diag), -spanning_tree_count(K, edges), sum(diag))
    else:
        raise ValueError(f"unknown objective: {objective}")


# ---------- local 2-swap search ----------

def _two_swap_candidates(
    K: int, edges: List[UndirectedEdge]
) -> List[Tuple[int, int, UndirectedEdge, UndirectedEdge]]:
    """Yield (idx1, idx2, new_e1, new_e2) candidate swaps that preserve all
    vertex degrees (so all-even is preserved if it was even).
    """
    n = len(edges)
    out = []
    edge_set = _multiset_count(edges)
    for i in range(n):
        a, b = edges[i]
        for j in range(i + 1, n):
            c, d = edges[j]
            # Try the two non-trivial reconnections (a-c, b-d) and (a-d, b-c).
            for (na, nb), (nc, nd) in [((a, c), (b, d)), ((a, d), (b, c))]:
                if na == nb or nc == nd:
                    continue
                e1 = _norm((na, nb))
                e2 = _norm((nc, nd))
                if e1 == _norm((a, b)) and e2 == _norm((c, d)):
                    continue  # no-op
                out.append((i, j, e1, e2))
    return out


def _try_swap(
    K: int,
    edges: List[UndirectedEdge],
    i: int,
    j: int,
    e1: UndirectedEdge,
    e2: UndirectedEdge,
    objective: str,
    current_key: Tuple,
    simple: bool = False,
) -> Optional[Tuple[List[UndirectedEdge], Tuple]]:
    new_edges = edges[:]
    new_edges[i] = e1
    new_edges[j] = e2
    if simple and len(set(new_edges)) != len(new_edges):
        return None  # would create a duplicate pair (reverse-free violated)
    if not is_connected(K, new_edges):
        return None
    try:
        key = _objective(K, new_edges, objective)
    except (ValueError, ArithmeticError):
        return None
    if key < current_key:
        return new_edges, key
    return None


def _local_search(
    K: int,
    edges: List[UndirectedEdge],
    objective: str,
    max_iter: int = 500,
    rng: Optional[random.Random] = None,
    simple: bool = False,
) -> List[UndirectedEdge]:
    rng = rng or random.Random(0)
    edges = edges[:]
    current_key = _objective(K, edges, objective)
    for _ in range(max_iter):
        improved = False
        candidates = _two_swap_candidates(K, edges)
        rng.shuffle(candidates)
        for i, j, e1, e2 in candidates:
            result = _try_swap(
                K, edges, i, j, e1, e2, objective, current_key, simple=simple
            )
            if result is not None:
                edges, current_key = result
                improved = True
                break
        if not improved:
            break
    return edges


# ---------- Eulerian orientation ----------

def orient_eulerian(K: int, edges: List[UndirectedEdge]) -> List[DirectedEdge]:
    """Orient each edge so that every vertex has equal in- and out-degree.
    Requires all-even degrees and connectedness; raises otherwise.
    """
    deg = _degrees(K, edges)
    if not _all_even(deg):
        raise ValueError(
            "Eulerian orientation requires all even degrees; "
            f"got {deg}. Strict tau-orthogonality is infeasible for this (K, N)."
        )
    if not is_connected(K, edges):
        raise ValueError("graph not connected; cannot orient")

    # Build adjacency with edge indices so each edge is traversed exactly once.
    adj: Dict[int, List[Tuple[int, int]]] = {v: [] for v in range(K)}
    used = [False] * len(edges)
    for idx, (a, b) in enumerate(edges):
        adj[a].append((b, idx))
        adj[b].append((a, idx))

    # Hierholzer's algorithm
    circuit: List[int] = []
    stack = [0]
    while stack:
        v = stack[-1]
        # pop the next unused edge from v
        while adj[v]:
            w, idx = adj[v].pop()
            if not used[idx]:
                used[idx] = True
                stack.append(w)
                break
        else:
            circuit.append(stack.pop())
    circuit.reverse()
    # Walking edge by edge in the circuit gives oriented edges
    oriented: List[DirectedEdge] = []
    for u, v in zip(circuit, circuit[1:]):
        oriented.append((u, v))
    if len(oriented) != len(edges):
        raise RuntimeError(
            f"Eulerian circuit length mismatch: {len(oriented)} != {len(edges)}"
        )
    return oriented


# ---------- public API ----------

def generate_design(
    K: int,
    N: int,
    objective: str = "d-optimal",
    seed: int = 0,
    max_iter: int = 500,
    forbid_reverse: bool = False,
) -> List[DirectedEdge]:
    """Generate a directed paired-comparison design.

    Args:
        K: number of objects (>= 2)
        N: number of comparisons per respondent (>= K)
        objective: 'd-optimal' (maximize spanning-tree count) or 'min-max-var'
        seed: random seed for the local search
        max_iter: maximum local-search iterations
        forbid_reverse: if True, no unordered pair may be used in both
            directions (the comparison graph is kept simple). May make some
            (K, N) infeasible (raises InfeasibleDesign).

    Returns:
        list of N directed (left, right) edges, with vertices in 0..K-1
    """
    if K < 2:
        raise ValueError(f"K must be >= 2; got K={K}")
    if N < K:
        raise ValueError(f"N must be >= K; got N={N}, K={K}")
    if forbid_reverse:
        if K < 3:
            raise InfeasibleDesign(
                f"reverse-free design requires K >= 3; got K={K}."
            )
        edges = _simple_seed(K, N)
    else:
        if N == K + 1 and K < 3:
            raise ValueError(f"N = K + 1 requires K >= 3; got K={K}")
        edges = _seed_graph(K, N)
    rng = random.Random(seed)
    edges = _local_search(
        K, edges, objective, max_iter=max_iter, rng=rng, simple=forbid_reverse
    )
    return orient_eulerian(K, edges)
