# Conjoint

Pairwise-comparison conjoint design + analysis stack.

```
conjoint/              # Python package: design generator + variance (stdlib only)
backend/               # FastAPI + SQLAlchemy + Alembic; depends on `conjoint`
web/                   # React + Vite + TS + Tailwind + shadcn
docker-compose.yml     # api + db (Postgres 16) + web
docs/                  # reference papers and the Danish specification
```

## Quick start (Docker)

```bash
docker compose up --build
# api:  http://localhost:8000/docs
# web:  http://localhost:5173
# db:   postgres://conjoint:conjoint@localhost:5432/conjoint
```

The API runs `alembic upgrade head` at container start, so the schema is
ready when the service comes up.

## Quick start (local Python, no Docker)

```bash
# 1. Use the package directly as a CLI
python -m conjoint generate --K 16 --N 20 --out design.csv
python -m conjoint scan --K 10 --N-min 10 --N-max 16

# 2. Or boot the API against SQLite for quick testing
cd backend
pip install -r requirements.txt
DATABASE_URL=sqlite:///./dev.db alembic upgrade head
DATABASE_URL=sqlite:///./dev.db PYTHONPATH=.. uvicorn app.main:app --reload
```

## Tests

```bash
python -m unittest conjoint.tests.test_design
```

## Endpoints

| Method | Path                                       | Purpose                              |
|--------|--------------------------------------------|--------------------------------------|
| GET    | `/healthz`                                 | liveness                             |
| POST   | `/api/design`                              | stateless: generate one design       |
| POST   | `/api/scan`                                | stateless: variance scan over N      |
| POST   | `/api/surveys`                             | create a survey                      |
| GET    | `/api/surveys`                             | list surveys                         |
| GET    | `/api/surveys/{id}`                        | get a survey + objects               |
| POST   | `/api/surveys/{id}/design`                 | generate + store a design            |
| GET    | `/api/surveys/{id}/designs`                | list designs for a survey            |
| POST   | `/api/surveys/{id}/respondents`            | create a respondent                  |
| GET    | `/api/surveys/{id}/respondents`            | list respondents                     |
| POST   | `/api/respondents/{id}/responses`          | submit response batch                |
| POST   | `/api/surveys/{id}/analyze`                | OLS per respondent, α + SE           |

## Data model (Postgres)

```
surveys ─┬─ objects   (K rows per survey, position 0..K-1)
         ├─ designs ─── trials   (N rows per design)
         └─ respondents ─── responses   (raw + centered y per trial)
```

## Model recap

Per respondent, under H1 (preference function exists):

```
y_k = α_{R(k)} − α_{L(k)} + τ + ε_k,    ε ~ N(0, σ²),    Σ α_i = 0
```

The design generator picks comparisons so every object has equal #left and
#right (Eulerian orientation), giving strict `(X′X)_{ατ} = 0`. With
residual_df = N − K ≥ 1 the analyzer returns SE(α_i) per respondent.
