# conjoint-backend

FastAPI service wrapping the `conjoint` package.

## Endpoints

| Method | Path           | Purpose                              |
|--------|----------------|--------------------------------------|
| GET    | `/healthz`     | Liveness check                       |
| POST   | `/api/design`  | Generate a single design (K, N)      |
| POST   | `/api/scan`    | Scan Var(α) over a range of N        |
| GET    | `/docs`        | OpenAPI interactive UI (auto)        |

## Run locally (without Docker)

```bash
# from the project root
cd backend
pip install -r requirements.txt
PYTHONPATH=.. uvicorn app.main:app --reload
```

Then open <http://localhost:8000/docs>.

## Run with Docker Compose

```bash
# from the project root
docker compose up --build api
```

## Example call

```bash
curl -s http://localhost:8000/api/design \
  -H 'content-type: application/json' \
  -d '{"K": 16, "N": 20}' | jq .summary
```
