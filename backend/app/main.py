"""FastAPI app entry point.

Routers:
    stateless   -> POST /api/design, POST /api/scan        (no DB)
    surveys     -> /api/surveys/*                          (persistent)
    responses   -> /api/respondents/*/responses            (persistent)
    analysis    -> POST /api/surveys/{id}/analyze          (OLS, requires numpy)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import analysis, organizations, stateless, surveys, users


app = FastAPI(
    title="Conjoint API",
    description=(
        "Pairwise-comparison conjoint design generator + analyzer. "
        "Wraps the `conjoint` Python package."
    ),
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stateless.router)
app.include_router(surveys.router)
app.include_router(surveys.resp_router)
app.include_router(analysis.router)
app.include_router(organizations.router)
app.include_router(users.router)


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}
