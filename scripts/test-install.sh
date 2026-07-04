#!/usr/bin/env bash
set -euo pipefail

export PATH="/tmp/node-v22.14.0-linux-x64/bin:$PATH"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

info() { echo -e "\033[0;36m[INFO]\033[0m  $*"; }
ok() { echo -e "\033[0;32m[OK]\033[0m    $*"; }
err() { echo -e "\033[0;31m[ERR]\033[0m   $*" >&2; }
fail() { err "$*"; exit 1; }

API_PORT=3000
WEB_PORT=3001
ADMIN_EMAIL="admin-test@cloudnest.local"
ADMIN_PASSWORD="TestAdminP4ss!"

# Detect the local PostgreSQL port
DB_PORT=5432
for p in 5432 5433 5434 5435; do
  if pg_isready -h localhost -p "$p" >/dev/null 2>&1; then
    DB_PORT="$p"
    break
  fi
done
info "Detected PostgreSQL on port ${DB_PORT}"

# Ensure a temporary DB user exists for this test (matches install script defaults)
info "Ensuring temporary DB user exists..."
if sudo -u postgres psql -p "$DB_PORT" -tc "SELECT 1 FROM pg_roles WHERE rolname='cloudnest'" 2>/dev/null | grep -q 1; then
  info "DB user 'cloudnest' already exists"
else
  sudo -u postgres psql -p "$DB_PORT" -c "CREATE ROLE cloudnest WITH LOGIN PASSWORD 'cloudnest';" >/dev/null 2>&1 || true
  sudo -u postgres psql -p "$DB_PORT" -c "ALTER ROLE cloudnest WITH SUPERUSER;" >/dev/null 2>&1 || true
fi
if ! sudo -u postgres psql -p "$DB_PORT" -tc "SELECT 1 FROM pg_database WHERE datname='cloudnest'" 2>/dev/null | grep -q 1; then
  sudo -u postgres psql -p "$DB_PORT" -c "CREATE DATABASE cloudnest OWNER cloudnest;" >/dev/null 2>&1 || true
fi
sudo -u postgres psql -p "$DB_PORT" -c "GRANT ALL PRIVILEGES ON DATABASE cloudnest TO cloudnest;" >/dev/null 2>&1 || true
ok "DB user 'cloudnest' is ready"

# Build a temporary .env for this test run so we don't clobber the user's .env
BACKUP_ENV=".env.test-backup"
if [ -f .env ]; then
  cp .env "$BACKUP_ENV"
fi
cat > .env <<EOF
NODE_ENV=production
PORT=$API_PORT
NEXT_PUBLIC_API_URL=http://localhost:$API_PORT
DATABASE_URL=postgresql://cloudnest:cloudnest@localhost:$DB_PORT/cloudnest
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
JWT_REFRESH_SECRET=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
TOTP_ISSUER=CloudNest
CORS_ORIGIN=http://localhost:$WEB_PORT
THROTTLE_TTL=60
THROTTLE_LIMIT=60
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@cloudnest.io
PROXMOX_HOST=
PROXMOX_API_TOKEN_ID=
PROXMOX_API_TOKEN_SECRET=
PROXMOX_NODE=
PROXMOX_STORAGE=
EOF

cleanup_env() {
  if [ -f "$BACKUP_ENV" ]; then
    mv "$BACKUP_ENV" .env
  else
    rm -f .env
  fi
}

cleanup_port() {
  fuser -k "$API_PORT/tcp" 2>/dev/null || true
  fuser -k "$WEB_PORT/tcp" 2>/dev/null || true
  sleep 1
}

trap 'cleanup_port; cleanup_env; exit' EXIT

# ─── Build ────────────────────────────────────────────────
info "Building shared types, API, and web..."
npm run build > /tmp/build.log 2>&1 || { cat /tmp/build.log | tail -30; fail "Build failed"; }
ok "Build completed"

# ─── Reset DB / seed admin ────────────────────────────────
info "Pushing schema and seeding admin..."
npm run prisma:push -- --accept-data-loss > /tmp/prisma-push.log 2>&1 || { cat /tmp/prisma-push.log | tail -30; fail "Prisma push failed"; }
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" npx ts-node apps/api/src/seed/seed-admin.ts > /tmp/seed.log 2>&1 || { cat /tmp/seed.log | tail -30; fail "Admin seed failed"; }
ok "Admin seeded: $ADMIN_EMAIL"

# ─── Start API ─────────────────────────────────────────────
info "Starting API..."
rm -f /tmp/api.log
node apps/api/dist/main.js > /tmp/api.log 2>&1 &
API_PID=$!

for i in {1..30}; do
  if curl -fsS http://127.0.0.1:$API_PORT/ >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS http://127.0.0.1:$API_PORT/ >/dev/null 2>&1; then
  cat /tmp/api.log | tail -40
  kill -9 $API_PID >/dev/null 2>&1 || true
  fail "API did not start"
fi
ok "API is reachable"

# ─── Login check ───────────────────────────────────────────
info "Testing admin login..."
LOGIN=$(curl -fsS -X POST "http://127.0.0.1:$API_PORT/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" 2>&1) || { cat /tmp/api.log | tail -20; fail "Login request failed"; }
if [[ "$LOGIN" != *'"accessToken"'* ]]; then
  echo "$LOGIN"
  fail "Login did not return accessToken"
fi
ok "Admin login works"

# ─── Start web ─────────────────────────────────────────────
info "Starting web..."
rm -f /tmp/web.log
NEXT_PUBLIC_API_URL="http://127.0.0.1:$API_PORT" PORT=$WEB_PORT node apps/web/node_modules/.bin/next start -p $WEB_PORT -H 0.0.0.0 > /tmp/web.log 2>&1 &
WEB_PID=$!

for i in {1..30}; do
  if curl -fsS http://127.0.0.1:$WEB_PORT/ >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS http://127.0.0.1:$WEB_PORT/ >/dev/null 2>&1; then
  cat /tmp/web.log | tail -20
  kill -9 $WEB_PID >/dev/null 2>&1 || true
  kill -9 $API_PID >/dev/null 2>&1 || true
  fail "Web did not start"
fi
ok "Web is reachable"

# ─── Admin settings API smoke test ────────────────────────
info "Testing admin settings API..."
ACCESS_TOKEN=$(echo "$LOGIN" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
SETTINGS=$(curl -fsS -X PUT "http://127.0.0.1:$API_PORT/admin/settings" -H 'Content-Type: application/json' -H "Authorization: Bearer $ACCESS_TOKEN" -d '{"proxmox_host":"pve.example.com"}' 2>&1) || { echo "$SETTINGS"; fail "Admin settings save failed"; }
ok "Admin settings API works"

# ─── Cleanup ──────────────────────────────────────────────
info "Stopping services..."
kill -TERM $WEB_PID $API_PID >/dev/null 2>&1 || true
sleep 1
kill -9 $WEB_PID $API_PID >/dev/null 2>&1 || true
ok "All services stopped"

# ─── Summary ──────────────────────────────────────────────
echo ""
echo -e "\033[0;32m═══════════════════════════════════════\033[0m"
echo -e "\033[0;32mA-to-Z verification passed\033[0m"
echo -e "\033[0;32m═══════════════════════════════════════\033[0m"
echo "  Admin: $ADMIN_EMAIL"
echo "  Pass:  $ADMIN_PASSWORD"
echo "  API:   http://127.0.0.1:$API_PORT"
echo "  Web:   http://127.0.0.1:$WEB_PORT"
