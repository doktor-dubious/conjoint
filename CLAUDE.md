# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This project develops a **pairwise-comparison conjoint analysis** system with the following distinguishing properties:

- Only two objects (offers) are compared at a time
- Preference distance is measured on a **continuous bipolar scale** ([-100, 100], slider, 0 = indifferent)
- The underlying statistical model is a **Gaussian GLM with identity link** (classical linear regression)
- Antisymmetry constraint: y_AB = -y_BA
- Experimental designs should maximize estimation power at the **individual respondent level**
- The system uses "indirect repetitions" (cycle redundancy in comparison graph) for statistical power

## Key Concepts

### Model Specification (under H1: preference function exists)

Based on Gabrielsen (2001) "A multi-level model for preferences":

- `y_k = (alpha_right - alpha_left) + tau + epsilon`, where `epsilon ~ N(0, sigma^2)`
- `alpha_i`: part-worth utility for object i, with sum-to-zero constraint
- `tau`: order/position effect (systematic left-right bias) — must be included
- Under H1: `theta_ij = alpha_j - alpha_i` (objects lie on a 1D preference scale)

### Indirect Repetitions

Cycle redundancy in the comparison graph. Under H1, the sum of theta values around any closed path must equal zero (e.g., `theta_PS + theta_SL - theta_PL = 0`). With K objects forming a complete graph K_K, this provides degrees of freedom to test H1 and separate model-fit error from pure measurement noise.

### Design Principles

- D-optimal design with full direction balance (orthogonality between theta and tau)
- Allocation across pairs should maximize `det(X'X)` under H1
- With K=3 objects and N=20 comparisons, allocation (6, 6, 8) across pairs is D-optimal with all-even split for full balance
- Each pair must have equal observations in both directions (left-right)

## Resolved Design Decisions ("Rune 1" Test Case)

The initial experiment specifies:
- **One attribute** (borgmesterpost) with **three categorical levels** (Pernille, Sisse, Line)
- Forbidden combinations: identical pairs only
- Main effects only, modeled as linear, respondent-specific coefficients
- No covariates at respondent level
- Single respondent
- Homogeneous design, max 20 comparisons, D-optimal, orthogonal, full direction balance
- The linear predictor must **not** exploit the difference structure x_A - x_B in the design
- tau (order effect) included in model
- Preference function assumed (not formally tested); report alpha-estimates with standard errors
- Randomized presentation order included in design
- Output format: CSV file

## Reference Papers

- **Gabrielsen (2001)** "A multi-level model for preferences" — primary methodological reference for the model, ANOVA decomposition, and cycle-based redundancy
- **Magat, Viscusi & Huber (1988)** "Paired Comparison and Contingent Valuation" — validates bipolar-slider + linear GLM approach; not directly used for design

## Project Status

Three layers exist:

- `conjoint/` — pure-Python (stdlib only) design generator + variance core. CLI: `python -m conjoint generate / scan`. Tests passing.
- `backend/` — FastAPI + SQLAlchemy + Alembic. Models, migrations, OLS analyzer, all endpoints wired. Depends on numpy. Untested locally; expected to boot via `docker compose up`.
- `web/` — React + Vite + TS + Tailwind + shadcn. Routes: surveys list/new/detail, participate (slider), results. Never `npm install`'d on the development box; expected to build on first run.

The `rune1_design.csv`, `result-1/`, and `result-2/` deliverables in the
project root are historical snapshots of past analyses. The K=16
deliverable in `result-design-K16/` is **stale** — the algorithm now finds
a strictly better design (3528 spanning trees vs 2160).

## Read me first when picking up

See **`HANDOFF.md`** at the repo root — that's the consolidated session-transfer document. It captures:

- the mathematical derivations and design decisions behind the code
- the "Rune 1" history including the OLD/NEW labelling bug
- per-component status, known limitations, and open questions awaiting the user
- how to verify the stack works on a fresh machine

If `HANDOFF.md` and this file disagree, `HANDOFF.md` is the more recent authoritative source.
