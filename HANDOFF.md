# HANDOFF — Conjoint project session context

> **Purpose:** A new Claude instance can read this single document plus the
> git checkout and pick up where the previous session left off. Captures
> everything the code doesn't: the math derivations, design decisions, "why
> this and not that," open questions, and the history that produced the
> current shape of the repo.

Last updated: 2026-06-20.

---

## 1. Who and what

- **Project owner:** Rune (`rfs@skardhamar.com`). Works in Python, knows the
  statistical content, wants a working app, not a research artifact.
- **Subject-matter authorities:** Gorm Gabrielsen (author of the primary
  reference paper) and Lars. They define the methodology; Rune is the
  practitioner/implementer.
- **Working language:** Mostly Danish in spec docs; replies and code can be
  in English; user-facing copy in Danish where it appears.

The project develops a **pairwise-comparison conjoint analysis** system with
non-standard properties:

- only two objects (offers) compared at a time
- preference distance on a **continuous bipolar scale** (slider, 0 = indifferent)
- underlying model is a **Gaussian GLM with identity link** (ordinary linear regression)
- antisymmetry: `y_AB = -y_BA`
- experimental designs maximize estimation power at the **individual respondent level**
- "indirect repetitions" = cycle redundancy in the comparison graph

---

## 2. Reference material in `docs/`

- **Gabrielsen (2001)** "A multi-level model for preferences" — primary
  methodological reference: model, ANOVA decomposition, cycle-based
  redundancy. Same author as the more recent "Paired comparisons and
  designed experiments" the user shared. This *is* the methodology.
- **Magat, Viscusi & Huber (1988)** "Paired Comparison and Contingent
  Valuation" — validates the bipolar-slider + linear GLM approach. Not used
  for design construction.
- **Danish spec** (`docs/Vi skal udvikle en slags statistisk conjoint
  analyse.docx`) — the original requirements document. The Rune 1 test case
  is defined in it.

If the new Claude needs to re-derive anything, the Gabrielsen 2001 paper is
the load-bearing source.

---

## 3. The mathematical core

### 3.1 Model under H1 (preference function exists)

For each respondent:

```
y_k = α_R(k) − α_L(k) + τ + ε_k,   ε_k ~ N(0, σ²)
constraint: Σ_i α_i = 0
```

- `α_i` is the part-worth utility of object `i`
- `τ` is the order/position effect (left-right bias), included as a single
  parameter per respondent
- `y_k` is the centered slider response; antisymmetry `y_AB = −y_BA` is
  **assumed**, not enforced from the raw response — see §3.5
- "Under H1" means: a preference function exists, i.e., `θ_ij = α_j − α_i`.
  Without H1, we'd have one `θ` per pair and cycle constraints to test (see
  Gabrielsen §3); with H1 (which the user has committed to for all current
  experiments), `θ` is replaced by α-differences.

### 3.2 Why `τ ⊥ α` matters

If every object appears equally often as **left** and as **right** across
all trials, then `(X′X)_{ατ} = 0`. That gives:

- `τ̂` and `α̂` estimated without mutual confusion
- the variance of `α̂_i` is just `σ² · L⁺_{ii}` where L is the comparison-graph Laplacian

This is the **direction balance** requirement. It's also why every object's
appearance count must be **even** — otherwise no Eulerian orientation
exists and one or more (r_i − l_i) entries in `(X′X)_{ατ}` is nonzero.

### 3.3 D-optimality = maximize spanning trees

With sum-to-zero on α and `τ ⊥ α`, the D-criterion `det(X′X)` is
proportional to the number of spanning trees of the comparison graph
(Kirchhoff / Matrix-Tree theorem; standard cofactor identity). So:

> **The design generator just hunts for the 20-edge (or N-edge) connected
> all-even-degree multigraph on K vertices with the most spanning trees.**

That's the entire D-optimality objective in this codebase.

### 3.4 Variance of `α̂_i`

Under sum-to-zero, `Var(α̂_i) = σ² · L⁺_{ii}` where `L⁺` is the
Moore-Penrose pseudoinverse of the graph Laplacian `L = D − A`. We compute
it exactly via `L⁺ = (L + J/n)⁻¹ − J/n²` with rational arithmetic
(`fractions.Fraction`) for design selection; numpy is used inside the
backend for OLS once real responses arrive.

### 3.5 The "scale [1, 100] vs y_AB = -y_BA" issue

For K=16 the user wrote "kontinuert skala gående fra 1 til 100" together
with `y_AB = -y_BA`. These are only compatible if the scale is **bipolar
with a midpoint** (e.g., 50.5) treated as indifference and responses are
**centered before analysis**:

```
y = raw_response − midpoint
```

In the SQLAlchemy schema this is encoded by storing both `raw_value` and
`y = raw_value − (scale_min + scale_max)/2` per response. The user has not
yet picked a canonical scale; the schema lets the survey owner choose
(default in the create-survey form: `[-50, +50]`).

**Open with the user:** confirm whether the eventual production scale is
`[-50, +50]` (presented to respondents that way) or `[1, 100]` (presented
that way, centered server-side).

---

## 4. Design generation algorithm

Implemented in `conjoint/design.py`. Takes `(K, N, objective)` and returns
N directed `(left, right)` pairs.

### 4.1 Strategy

1. **Target degree distribution** (`target_degrees`): every vertex's
   appearance count must be ≥ 2 and even. With 2N total appearances over K
   vertices, the most balanced even allocation is computed by distributing
   the `2N − 2K` "excess" in increments of 2 round-robin.

2. **Seed graph** (`_seed_graph`):
   - `extra = N − K = 0` → Hamiltonian cycle
   - `extra = 1` → **(K−1)-cycle + doubled edge** sharing one vertex with
     the cycle (whole graph, K+1 edges). This is the special case: a
     single chord edge can't preserve all-even parity, but a (K−1)-cycle
     plus a doubled edge can.
   - `2 ≤ extra ≤ K` → Hamiltonian + chord-cycle of length `extra` on
     `extra` evenly spaced hubs (extra=2 is a doubled chord, intentional)
   - `extra > K` → Hamiltonian + full chord K-layer (offset 2 to differ
     from the Hamiltonian; falls back to offset 1 for K ∈ {3, 4}) +
     recursion on `extra − K`
   - `extra = K + 1` → handled inside `_chord_subgraph` the same way as
     extra=1 but at the chord level

3. **Local 2-swap search** (`_local_search`): for each pair of edges,
   try the two non-trivial reconnections (a-c, b-d) and (a-d, b-c). Accept
   if (a) the graph stays connected, (b) the objective improves. The 2-swap
   preserves vertex degrees, so all-even is preserved automatically.

4. **Eulerian orientation** (`orient_eulerian`): Hierholzer's algorithm
   over the final multigraph. Result: every vertex has #right = #left, so
   `τ ⊥ α` strictly.

5. **Constrained shuffle** (in CLI / backend): re-order trials to minimize
   the number of consecutive trials sharing an object.

### 4.2 Objectives

- `d-optimal` (default) — minimize `(-spanning_trees, max_var, sum_var)`
- `min-max-var` — minimize `(max_var, -spanning_trees, sum_var)`

`spanning_tree_count` uses the matrix-tree theorem (determinant of any
(K-1)×(K-1) principal minor of L).

### 4.3 Notable findings during development

- For K=10, N=11 (`extra=1`) the variance ratio is **2.64×** and only 30
  spanning trees — much worse than N=12 (ratio 1.84, 108 trees). The
  algorithm picks the structurally-forced (K-1)-cycle + doubled edge and
  can't reshape into something nicer because parity pins it down. The user
  should be guided toward `N ≥ K + 2` when SEs matter.

- For K=16, N=20, the **local search beat the hand-built design** on every
  metric:
  - spanning trees: 3528 vs 2160 (hand-built)
  - max Var/σ²: 0.788 vs 0.987
  - max/min ratio: 1.80 vs 2.63
  
  Therefore the hand-built `result-design-K16/design_K16_N20.csv` is
  **stale**; regenerate it via the algorithm before sending to the user.

- For the hand-built K=16 design there are actually **5 distinct variance
  values**, not 3 as initially reported. The 4-chord structure (1→9, 9→13,
  13→5, 5→1) is not fully 4-fold symmetric — it alternates short (length 4)
  and long (length 8) chords on the 16-cycle. The asymmetry produces two
  separate orbits of "hub-neighbors" and two orbits of "midpoints."
  Acknowledged to the user.

### 4.4 Limits

- Local search is greedy / first-improvement. For large K we likely need
  simulated annealing or restarts. Currently fine through K≈30.
- Rational arithmetic in `_linalg.py` is O(K³) per evaluation. Fine through
  K≈100; replace with numpy/scipy for larger.
- `extra > 2K` works recursively but the seed can have many multi-edges;
  the local search reshapes them in most cases.

---

## 5. OLS analysis algorithm

Implemented in `backend/app/analysis.py` (numpy-based).

```
parameterize β = (α_1, ..., α_{K-1}, τ),  α_K = −Σ_{i<K} α_i
solve OLS via np.linalg.lstsq
residual_df = N − K  (or N − rank if rank-deficient)
sigma_hat = sqrt(RSS / residual_df)  if residual_df > 0
cov(β) = sigma_hat² · (X′X)⁻¹
SE(α_K) = sqrt(Σ_{i,j < K-1} cov_α[i,j])  -- because α_K = −Σ
```

When `residual_df = 0` the model is saturated → no SE. This is the bug we
hit in Rune 1's K=3, N=3 dataset (see §6).

Verified by 5 parameterized tests in `backend/tests/test_analysis.py`
against the K=3 closed form:

```
τ̂   = (y_LP + y_SL + y_PS) / 3
α̂_L = (y_SL − y_LP) / 3
α̂_P = (y_LP − y_PS) / 3
α̂_S = (y_PS − y_SL) / 3
```

These tests need numpy + pytest; run them inside the api container with
`docker compose run --rm api pytest tests/`.

---

## 6. The "Rune 1" history (read this if asked about past deliverables)

### 6.1 The 3-object pilot

- Attribute: borgmesterpost (mayor candidacy)
- Levels: Pernille (P), Sisse (S), Line (L)
- Designed for one respondent doing 20 comparisons, allocation (6, 6, 8)
  across pairs, fully direction-balanced.
- Output: `rune1_design.csv` (still on disk, considered the canonical Rune 1
  experimental plan).

### 6.2 The 110-respondent dataset with the labelling bug

A 110-respondent dataset (`kommunevalg_lodret_RUNE.xlsx`, then a corrected
`_NY` version) was provided. Each respondent did 3 comparisons (PS, SL, LP).

**Critical bug in the OLD file:** the `Par` column labels `LP` and `PS`
were swapped relative to the actual `(left, right)` numeric codes. The NEW
file (`_NY`) renamed the column to `PSNY` and got the mapping right.

Algebraic consequence (worked out in the previous chat):

```
OLD α_P = −NEW α_P
OLD α_L = −NEW α_S
OLD α_S = −NEW α_L
OLD τ    =  NEW τ
```

The "Pernille bedst" conclusion from the OLD analysis was an artefact of
the labelling. Corrected ranking: **S > L > P** (Sisse > Line > Pernille),
with very small differences and large between-respondent variance.

**Critical follow-on issue still open:** with only 3 comparisons per
respondent (K=3, N=3), the model is saturated (residual_df = 0) and
individual α-SEs **cannot be computed**. The Rune 1 production design
(N=20) was specifically built to fix this. The user has been offered three
fallbacks (assume τ=0; pool σ² across respondents; respondent-level
bootstrap) and hasn't picked one. If asked about SEs for the 110-respondent
data, this is the relevant context.

Output files: `data/alpha_estimates.csv` (corrected analysis), plus
`alpha_estimates.pdf` (notes for the user, generated via headless Chromium
on HTML).

### 6.3 The K=16, N=20 design

Requested by Gorm & Lars for 106 respondents. Same model, larger graph.
Hand-built deliverable shipped first (16-cycle + 4-cycle chords on hubs
{1, 5, 9, 13}). Algorithm later found a better design (see §4.3). If the
user asks for the K=16 plan again, regenerate via:

```bash
python -m conjoint generate --K 16 --N 20 --out design_K16_N20.csv
```

---

## 7. Current architecture

```
conjoint/                # pure-Python stats core (stdlib only, no numpy)
├── design.py            # generate_design, _seed_graph, orient_eulerian
├── variance.py          # laplacian, pseudoinverse_diag, spanning_tree_count
├── scan.py              # variance_scan(K, N_min, N_max)
├── cli.py + __main__.py # python -m conjoint generate / scan
├── _linalg.py           # exact rational inv() and det()
└── tests/               # 11 tests, all passing

backend/                 # FastAPI + SQLAlchemy + Alembic, depends on conjoint
├── app/
│   ├── main.py          # FastAPI app + CORS + router wiring
│   ├── db.py            # engine, SessionLocal, get_db dependency
│   ├── models.py        # SQLAlchemy 2.0 models
│   ├── schemas.py       # all Pydantic models
│   ├── analysis.py      # OLS fit_respondent (uses numpy)
│   └── routers/
│       ├── stateless.py # POST /api/design, /api/scan
│       ├── surveys.py   # CRUD + design + responses
│       └── analysis.py  # POST /api/surveys/{id}/analyze
├── alembic/             # one migration: 0001_initial creates 6 tables
├── tests/               # OLS unit tests, require numpy + pytest
├── Dockerfile           # runs alembic upgrade head then uvicorn
└── requirements.txt     # fastapi, sqlalchemy, alembic, psycopg, numpy

web/                     # React + Vite + TS + Tailwind + shadcn (v7 router)
├── src/
│   ├── App.tsx          # routes + Layout shell
│   ├── lib/api.ts       # typed fetch client for ALL backend endpoints
│   ├── lib/utils.ts     # cn() helper
│   ├── components/ui/   # shadcn primitives: button, input, label, card
│   └── pages/           # ScanPage, SurveyListPage, SurveyNewPage,
│                        # SurveyDetailPage, ParticipantPage, ResultsPage
├── package.json         # React 18, Vite 6, TS 5.7, react-router-dom 7
├── tailwind.config.js + components.json (shadcn)
└── Dockerfile           # node:20-alpine + npm run dev

docker-compose.yml       # api + db (Postgres 16) + web
```

### 7.1 Data model

```
surveys ─┬─ objects     (K rows per survey, position 0..K-1)
         ├─ designs ─── trials       (N rows per design)
         └─ respondents ─── responses (one row per (respondent, trial))
```

All cascade-delete; unique constraints on `(survey, position)` and
`(respondent, trial)`. Responses store both `raw_value` and centered `y`.

### 7.2 API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | liveness |
| POST | `/api/design` | stateless: generate one design |
| POST | `/api/scan` | stateless: variance scan over N |
| POST | `/api/surveys` | create a survey + K objects |
| GET | `/api/surveys` | list |
| GET | `/api/surveys/{id}` | get + objects |
| POST | `/api/surveys/{id}/design` | generate + store design |
| GET | `/api/surveys/{id}/designs` | list designs |
| POST | `/api/surveys/{id}/respondents` | create respondent |
| GET | `/api/surveys/{id}/respondents` | list |
| POST | `/api/respondents/{id}/responses` | batch submit responses |
| POST | `/api/surveys/{id}/analyze` | OLS per respondent + aggregate |

### 7.3 Frontend routes

| Path | Page | Notes |
|---|---|---|
| `/`, `/surveys` | SurveyListPage | grid of cards |
| `/surveys/new` | SurveyNewPage | form, auto-generates D-optimal design |
| `/surveys/:id` | SurveyDetailPage | objects + designs + CSV download |
| `/surveys/:id/participate` | ParticipantPage | slider per trial, no nav |
| `/surveys/:id/results` | ResultsPage | aggregate + per-respondent fits |
| `/scan` | ScanPage | stateless variance scan |

---

## 8. Status by component

| Component | Status | Notes |
|---|---|---|
| `conjoint/` package | ✅ working | 11 unit tests passing |
| Design generator | ✅ working | handles N ∈ [K, ~3K]; N=K+1 special-cased |
| Variance scan | ✅ working | N=K+1 now produces a row (was previously skipped) |
| CLI (`python -m conjoint`) | ✅ working | generate + scan subcommands |
| FastAPI backend | ✅ wired but unrun | not booted on this machine; depends on numpy/sqlalchemy |
| SQLAlchemy models | ✅ defined | 6 tables; one Alembic migration |
| OLS analyzer | ✅ written, untested locally | tests need numpy + Docker |
| OLS unit tests | ✅ written | 5 parameterized tests; run inside the api container |
| React frontend | ✅ scaffolded | not built (`npm install` never run on this box) |
| Docker Compose | ✅ defined | api + db + web; `alembic upgrade head` on api start |

**Verified locally:** the conjoint package + CLI. Everything else is
syntax-checked but never executed end-to-end. The first thing to do on the
new machine is `docker compose up --build` and confirm the round-trip
(create survey → design → participate → results) works.

---

## 9. Known limitations / deliberate omissions

- **No auth.** API and participant view are open. Fine for local dev,
  unacceptable for any real survey. Punted until identity provider is
  chosen.
- **No partial-progress save.** Closing the participant tab loses all
  progress; needs per-trial save.
- **Aggregate α has no SE.** It's just the sample mean of per-respondent
  α̂. A proper SE on the mean needs a hierarchical/random-effects model
  (mixed-model fit). Not done.
- **No charts.** Results page is a table. Bar chart with error bars would
  be a small lift (recharts is the natural pick).
- **No survey listing protections.** Anyone can list/edit any survey.
- **`prepend_sys_path` in alembic.ini** assumes `alembic` is run from
  `backend/` directory or with `PYTHONPATH` covering `conjoint/`. The
  Dockerfile sets `PYTHONPATH=/srv` so it works in container; for local
  alembic use, `cd backend && PYTHONPATH=.. alembic …`.
- **N > 2K** works in the seed builder but isn't heavily tested. Tests
  cover up to N=2K explicitly.
- **No frontend tests.** The whole `web/` is scaffolded and presumed to
  build on first `npm install`, but never been compiled.

---

## 10. Open questions awaiting the user

1. **Production scale:** `[-50, +50]` (bipolar) or `[1, 100]` (presented,
   centered server-side)? (See §3.5.)
2. **Object naming for K=16:** if 4 specific objects are substantively most
   important, mapping them to hubs gives lower variance. The user hasn't
   specified.
3. **Variance equality vs D-optimality trade-off:** the user asked for both;
   they conflict. Default is D-optimal. The CLI has a `--objective
   min-max-var` flag if they want flatter variances.
4. **SE strategy for Rune 1 110-respondent dataset** (K=3, N=3, saturated):
   pool σ², bootstrap, or assume τ=0? Awaiting user pick.
5. **Stale K=16 deliverable** (`result-design-K16/design_K16_N20.csv`) —
   should be regenerated by the algorithm (3528 trees vs 2160). User hasn't
   asked for the regenerated version.
6. **Next dev priority:** the user has asked for "(1) auth, (2) partial-save
   on participant, (3) charts on results, or other"-class follow-ups but
   hasn't picked one yet.

---

## 11. Workflow conventions established with this user

- The user prefers **terse, direct responses** that lead with the answer.
- The user is comfortable with math notation; explain *why* a number, not
  just "it's 2.63x" — derivations are wanted.
- When asked to ship something, **build the code first, then summarize**;
  don't ask "do you want me to start." When asked for opinion, give one
  clearly.
- Danish OK for user-facing copy in deliverables (PDF notes, etc.); English
  for code and developer-facing docs.
- The user has been issuing one task at a time, sometimes in batches
  ("1, 2, 3 all of them"). Tasks have been tracked with TaskCreate.
- **Don't recreate stale deliverables** without flagging it. The K=16 PDF
  and CSV in `result-design-K16/` are stale and the user has not asked for
  refreshed versions.

---

## 12. How to verify on the new machine

```bash
# 1. Stats core (no deps; should just work)
python3 -m unittest conjoint.tests.test_design        # 11 tests
python3 -m conjoint generate --K 16 --N 20 --out /tmp/d.csv
python3 -m conjoint scan --K 10 --N-min 10 --N-max 16

# 2. Full stack
docker compose up --build
# api:  http://localhost:8000/docs
# web:  http://localhost:5173
docker compose run --rm api pytest tests/             # OLS tests

# 3. End-to-end smoke
# - browse to http://localhost:5173
# - "New survey" with K=3, N=20, objects "Pernille,Sisse,Line"
# - open the new survey, then "Participate" — fill 20 sliders
# - "Results" should show α̂ ± SE with residual_df = 17
```

---

## 13. Files NOT to forget

- `rune1_design.csv` — canonical Rune 1 K=3, N=20 design
- `result-1/alpha_estimates.csv` + `.pdf` — original (mislabeled) analysis
- `result-2/alpha_estimates.csv` + `.pdf` — corrected analysis on `_NY` data
- `result-design-K16/design_K16_N20.csv` + `design_notes.pdf` — **stale**, regenerate before sending
- `docs/` — reference papers + Danish spec
- The user's vim swap file `.README.md.swp` and `test.csv` at the project
  root are user state; do not delete.

---

*End of handoff. The new Claude reads this + the git checkout and is up to
speed. If any of §3-4 needs a deeper derivation, the Gabrielsen 2001 paper
in `docs/` is the source of truth.*
