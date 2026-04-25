#!/bin/bash

# Local Test Reset Script for yt-diff
# Faster alternative to run_tests.sh for local development:
#   - Drops all tables in postgres (vidlist DB)
#   - Flushes valkey cache
#   - Restarts yt-diff so it recreates the schema fresh
#
# Prerequisites: the production stack must already be running via docker compose
#   docker compose --env-file .localenv up -d

set -euo pipefail

COMPOSE_FILE="${1:-../docker-compose.yml}"
ENV_FILE="${2:-../.localenv}"

DB_CONTAINER="yt-db"
VALKEY_CONTAINER="valkey"
YTDIFF_CONTAINER="yt-diff"

DB_USER="ytdiff"
DB_NAME="vidlist"

echo "🔄  yt-diff local reset"
echo "──────────────────────────────────────────"

# ── 1. Drop all tables in postgres ──────────────────────────────────────────
echo "📦  Dropping all tables in '${DB_NAME}'..."
docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" <<'SQL'
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Disable triggers so FK constraints don't block drops
    SET session_replication_role = 'replica';

    FOR r IN (
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        RAISE NOTICE 'Dropped table: %', r.tablename;
    END LOOP;

    SET session_replication_role = 'origin';
END $$;
SQL
echo "✅  All tables dropped."

# ── 2. Flush valkey ─────────────────────────────────────────────────────────
echo "🧹  Flushing valkey..."
docker exec "${VALKEY_CONTAINER}" valkey-cli FLUSHALL
echo "✅  Valkey flushed."

# ── 3. Restart yt-diff (it will recreate the schema on startup) ─────────────
echo "🚀  Restarting yt-diff..."
docker compose --file "${COMPOSE_FILE}" --env-file "${ENV_FILE}" restart "${YTDIFF_CONTAINER}"
echo "✅  yt-diff restarted."

# ── 4. Wait for yt-diff to be healthy ───────────────────────────────────────
echo "⏳  Waiting for yt-diff to become healthy..."
TIMEOUT=60
ELAPSED=0
until docker inspect --format='{{.State.Health.Status}}' "${YTDIFF_CONTAINER}" 2>/dev/null | grep -q "healthy"; do
    if [ "${ELAPSED}" -ge "${TIMEOUT}" ]; then
        echo "❌  Timed out waiting for ${YTDIFF_CONTAINER} to become healthy."
        exit 1
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done

echo ""
echo "✅  Reset complete — yt-diff is healthy and ready for tests."
echo "──────────────────────────────────────────"
