FROM python:3.12-slim

WORKDIR /srv

# Install backend deps
COPY backend/requirements.txt /srv/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the conjoint package (stats core) and the backend app
COPY conjoint /srv/conjoint
COPY backend/app /srv/app
COPY backend/alembic.ini /srv/alembic.ini
COPY backend/alembic /srv/alembic
COPY backend/tests /srv/tests
COPY backend/pytest.ini /srv/pytest.ini
COPY backend/entrypoint.sh /srv/entrypoint.sh
RUN chmod +x /srv/entrypoint.sh

# Dev/test deps (skipped if you build with --target prod later)
RUN pip install --no-cache-dir pytest httpx

ENV PYTHONPATH=/srv
EXPOSE 8000

ENTRYPOINT ["/srv/entrypoint.sh"]
