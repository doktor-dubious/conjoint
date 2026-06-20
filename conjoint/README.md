# conjoint — pairwise-comparison design generator

Pure-Python (stdlib only) package for generating D-optimal directed paired-comparison
designs with strict τ⊥α orthogonality.

## Quick start

```bash
# Generate a 16-object, 20-comparison design
python -m conjoint generate --K 16 --N 20 --out design.csv

# Scan how Var(α) decreases as N grows
python -m conjoint scan --K 10 --N-min 10 --N-max 16 --out scan.csv

# Run the test suite
python -m unittest conjoint.tests.test_design
```

## Outputs

### `generate`
Writes a CSV of `(trial, left, right, pair)` rows. Presentation order is
shuffled to avoid back-to-back trials sharing an object. Console summary
shows min/max/ratio Var(α)/σ² and the number of spanning trees of the
design graph (the D-criterion).

### `scan`
One row per feasible N. Columns: `N, residual_df, min_var, max_var,
mean_var, ratio, spanning_trees, n_distinct_var, feasible, note`. Rows
where strict τ⊥α is infeasible (only N=K+1) are skipped with a note.

Example output for K=10:

```
  N  rdf       min       max      mean   ratio      #tree
 10    0    0.9150    0.9150    0.9150    1.00         10   (saturated, no SE)
 11    1                          -- infeasible --
 12    2    0.3575    0.6575    0.5975    1.84        108
 13    3    0.3675    0.6675    0.5437    1.82        256
 14    4    0.3492    0.6033    0.4975    1.73        576
 15    5    0.3332    0.5877    0.4605    1.76       1210
 16    6    0.3264    0.5943    0.4366    1.82       2352
```

Going from N=K=10 to N=12 cuts mean variance from 0.92 σ² to 0.60 σ² (35%
reduction) AND gives 2 residual df so SEs can be computed. Beyond that the
returns diminish.

## Constraints / known limits

- **N = K + 1 is infeasible** for strict τ⊥α. Each object's appearance count
  must be even; one extra comparison forces an odd count somewhere.
- **N > 2K is not yet implemented.** The seed-graph builder handles `N - K`
  chord edges only up to `K`. For very dense designs add a custom seed or
  extend `_seed_graph`.
- **Exact rational arithmetic** (no numpy). Comfortable up to K ≈ 50;
  swap in numpy for larger K.

## Public API

```python
from conjoint import generate_design, variance_stats, variance_scan

# Generate a directed design
directed = generate_design(K=16, N=20, objective="d-optimal", seed=0)
# -> list of (left, right) pairs, vertices in 0..K-1

# Compute Var(α) statistics for an existing design
undirected = [(min(a,b), max(a,b)) for a,b in directed]
stats = variance_stats(K=16, edges=undirected)
# -> {'min', 'max', 'mean', 'ratio', 'spanning_trees', 'n_distinct'}

# Scan across N
rows = variance_scan(K=10, N_min=10, N_max=20)
```

## Model

Per respondent, under H1 (preference function exists):

```
y_k = α_{R(k)} − α_{L(k)} + τ + ε_k,    ε ~ N(0, σ²)
constraint: Σ α_i = 0
```

With every vertex having equal #left and #right (Eulerian orientation),
the design matrix satisfies `(X′X)_{ατ} = 0`, so τ̂ and α̂ are estimated
independently. `Var(α̂_i) = σ² × L⁺_{ii}` where `L⁺` is the pseudoinverse
of the graph Laplacian `L = D − A`.

D-optimality (max `det(X′X)` under sum-to-zero) is equivalent to maximizing
the number of spanning trees of the design graph (Kirchhoff / Matrix-Tree
theorem).
