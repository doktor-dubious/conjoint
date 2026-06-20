#!/usr/bin/env bash
# Container entrypoint: run pending migrations, then start uvicorn.
set -euo pipefail

cd /srv
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
