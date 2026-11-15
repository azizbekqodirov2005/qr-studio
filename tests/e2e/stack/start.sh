#!/usr/bin/env bash
# Starts a local Supabase-compatible stack for end-to-end tests:
#   PostgreSQL 16 (local install) + real GoTrue + real PostgREST + test gateway.
# Usage: tests/e2e/stack/start.sh   (writes .env.e2e for the Vite build)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STACK=/tmp/stack
PG_BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
PGPORT=54322
JWT_SECRET=${JWT_SECRET:-e2e-super-secret-jwt-token-with-at-least-32-characters}
GOTRUE_VERSION=v2.180.0
POSTGREST_VERSION=v12.2.3

mkdir -p "$STACK/bin" "$STACK/logs"

# --- binaries -----------------------------------------------------------------
if [ ! -x "$STACK/bin/postgrest" ]; then
  curl -sSL -o "$STACK/pgrst.tar.xz" "https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x64.tar.xz"
  tar -xJf "$STACK/pgrst.tar.xz" -C "$STACK/bin"
fi
if [ ! -x "$STACK/auth/auth" ]; then
  mkdir -p "$STACK/auth"
  curl -sSL -o "$STACK/auth.tgz" "https://github.com/supabase/auth/releases/download/${GOTRUE_VERSION}/auth-${GOTRUE_VERSION}-x86.tar.gz"
  tar -xzf "$STACK/auth.tgz" -C "$STACK/auth"
fi

# --- PostgreSQL ---------------------------------------------------------------
if [ -f "$STACK/pgdata/postmaster.pid" ]; then su postgres -c "$PG_BIN/pg_ctl -D $STACK/pgdata -m fast stop" >/dev/null 2>&1 || true; fi
pkill -f "postgres -D $STACK/pgdata" 2>/dev/null || true
pkill -f "$STACK/bin/postgrest" 2>/dev/null || true
pkill -f "$STACK/auth/auth" 2>/dev/null || true
for pid in $(pgrep -f "(^|/)auth$" || true); do kill "$pid" 2>/dev/null || true; done
pkill -f "tests/e2e/stack/gateway.mjs" 2>/dev/null || true
for i in $(seq 1 20); do pg_isready -h 127.0.0.1 -p $PGPORT >/dev/null 2>&1 || break; sleep 0.5; done
sleep 1
rm -rf "$STACK/pgdata" "$STACK/storage"
mkdir -p "$STACK/pgdata" && chown postgres:postgres "$STACK/pgdata" "$STACK/logs"
su postgres -c "$PG_BIN/initdb -D $STACK/pgdata -U postgres --auth=trust >/dev/null"
su postgres -c "$PG_BIN/pg_ctl -D $STACK/pgdata -o '-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1' -l $STACK/logs/postgres.log start >/dev/null"
for i in $(seq 1 30); do pg_isready -h 127.0.0.1 -p $PGPORT >/dev/null 2>&1 && break; sleep 0.5; done

PSQL="psql -h 127.0.0.1 -p $PGPORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f "$ROOT/tests/e2e/stack/bootstrap.sql"

# --- GoTrue (runs its own migrations into the auth schema) ---------------------
export GOTRUE_DB_DRIVER=postgres
export DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:$PGPORT/postgres"
export GOTRUE_DB_DATABASE_URL="$DATABASE_URL"
export GOTRUE_DB_MIGRATIONS_PATH="$STACK/auth/migrations"
export GOTRUE_DB_NAMESPACE=auth
export GOTRUE_API_HOST=127.0.0.1
export PORT=9999
export API_EXTERNAL_URL=http://127.0.0.1:54321
export GOTRUE_SITE_URL=http://127.0.0.1:4173
export GOTRUE_URI_ALLOW_LIST="http://127.0.0.1:4173/**"
export GOTRUE_JWT_SECRET="$JWT_SECRET"
export GOTRUE_JWT_EXP=3600
export GOTRUE_JWT_AUD=authenticated
export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
export GOTRUE_JWT_ADMIN_ROLES=service_role
export GOTRUE_EXTERNAL_EMAIL_ENABLED=true
export GOTRUE_MAILER_AUTOCONFIRM=true
export GOTRUE_DISABLE_SIGNUP=false
export GOTRUE_SMTP_HOST=127.0.0.1
export GOTRUE_SMTP_PORT=2525
export GOTRUE_SMTP_ADMIN_EMAIL=noreply@qrstudio.test
export GOTRUE_SMTP_SENDER_NAME="QR Studio"
export GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
export GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify
export GOTRUE_MAILER_URLPATHS_INVITE=/auth/v1/verify
export GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify
export GOTRUE_RATE_LIMIT_EMAIL_SENT=1000
export GOTRUE_RATE_LIMIT_TOKEN_REFRESH=1000
export GOTRUE_RATE_LIMIT_VERIFY=1000
export GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=false
export GOTRUE_PASSWORD_MIN_LENGTH=8
export GOTRUE_LOG_LEVEL=warn
(cd "$STACK/auth" && nohup "$STACK/auth/auth" > "$STACK/logs/auth.log" 2>&1 &)
for i in $(seq 1 60); do curl -sf http://127.0.0.1:9999/health >/dev/null 2>&1 && break; sleep 0.5; done
curl -sf http://127.0.0.1:9999/health >/dev/null || { echo "GoTrue failed"; tail -30 "$STACK/logs/auth.log"; exit 1; }

# --- App migration (the file shipped with the project) -------------------------
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -f "$f"; done

# --- PostgREST -----------------------------------------------------------------
cat > "$STACK/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:postgres@127.0.0.1:$PGPORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = 54330
db-pool = 10
EOF
nohup "$STACK/bin/postgrest" "$STACK/postgrest.conf" > "$STACK/logs/postgrest.log" 2>&1 &
for i in $(seq 1 30); do curl -sf http://127.0.0.1:54330/ >/dev/null 2>&1 && break; sleep 0.5; done

# --- Gateway --------------------------------------------------------------------
JWT_SECRET="$JWT_SECRET" DB_URL="postgres://postgres@127.0.0.1:$PGPORT/postgres" STORAGE_DIR="$STACK/storage" \
  nohup node "$ROOT/tests/e2e/stack/gateway.mjs" > "$STACK/logs/gateway.log" 2>&1 &
for i in $(seq 1 30); do curl -sf http://127.0.0.1:54321/__test/health >/dev/null 2>&1 && break; sleep 0.3; done

# --- anon key (a JWT with role=anon, exactly like Supabase's) --------------------
ANON_KEY=$(JWT_SECRET="$JWT_SECRET" node -e '
const c=require("crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const h=b({alg:"HS256",typ:"JWT"}),p=b({role:"anon",iss:"supabase",iat:1700000000,exp:2000000000});
process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url"));')
cat > "$ROOT/.env.e2e" <<EOF
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=$ANON_KEY
VITE_PUBLIC_SITE_URL=http://127.0.0.1:4173
EOF
echo "stack ready (anon key written to .env.e2e)"
