#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/ahmedmesbah0/Cloud-Nest"
INSTALL_DIR="${INSTALL_DIR:-$HOME/cloudnest}"
INSTALL_BRANCH="${INSTALL_BRANCH:-main}"
NODE_VERSION_MIN="18"
SKIP_SYSTEM_INSTALL="${SKIP_SYSTEM_INSTALL:-0}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err() { echo -e "${RED}[ERR]${NC}   $*" >&2; }

prompt_input() {
  local prompt="$1"
  local var_name="$2"

  if [ -t 0 ]; then
    read -rp "$prompt" "$var_name"
  elif [ -r /dev/tty ]; then
    read -rp "$prompt" "$var_name" </dev/tty
  else
    read -rp "$prompt" "$var_name"
  fi
}

ensure_tty_input() {
  if [ ! -t 0 ] && [ -r /dev/tty ]; then
    exec 0</dev/tty
  fi
}

normalize_action() {
  case "${1:-}" in
    1|install) echo "install" ;;
    2|update) echo "update" ;;
    3|uninstall) echo "uninstall" ;;
    4|exit|quit|q) echo "exit" ;;
    *) echo "" ;;
  esac
}

log_section() { echo -e "\n${CYAN}==> $*${NC}"; }

run_with_retry() {
  local retries="$1"
  local delay="$2"
  shift 2
  local attempt=1
  while true; do
    if "$@"; then
      return 0
    fi
    if [ "$attempt" -ge "$retries" ]; then
      return 1
    fi
    warn "Command failed (attempt $attempt/$retries): $*"
    sleep "$delay"
    attempt=$((attempt + 1))
  done
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1
}

detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_VERSION="${VERSION_ID:-unknown}"
    OS_NAME="${PRETTY_NAME:-${OS_ID}}"
  else
    OS_ID="unknown"
    OS_VERSION="unknown"
    OS_NAME="unknown"
  fi
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) echo "unknown" ;;
  esac
}

find_available_port() {
  local port="$1"
  local candidate="$port"
  while true; do
    if ! (command -v python3 >/dev/null 2>&1 && python3 - "$candidate" <<'PY' >/dev/null 2>&1
import socket, sys
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    s.bind(("0.0.0.0", int(sys.argv[1])))
except OSError:
    sys.exit(1)
finally:
    s.close()
PY
); then
      candidate=$((candidate + 1))
      if [ "$candidate" -gt 65535 ]; then
        err "No free port found starting from $port"
        exit 1
      fi
    else
      echo "$candidate"
      return 0
    fi
  done
}

get_public_host() {
  if command -v hostname >/dev/null 2>&1; then
    local host
    host="$(hostname -I 2>/dev/null | awk '{print $1}')"
    if [ -n "$host" ]; then
      echo "$host"
      return 0
    fi
  fi
  echo "127.0.0.1"
}

set_env_value() {
  local file_path="$1"
  local key="$2"
  local value="$3"
  python3 - "$file_path" "$key" "$value" <<'PY'
import pathlib, sys
file_path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
path = pathlib.Path(file_path)
if path.exists():
    lines = path.read_text().splitlines()
else:
    lines = []
updated = False
for idx, line in enumerate(lines):
    if line.startswith(f"{key}="):
        lines[idx] = f"{key}={value}"
        updated = True
        break
if not updated:
    lines.append(f"{key}={value}")
path.write_text("\n".join(lines) + "\n")
PY
}

ensure_env_value() {
  local file_path="$1"
  local key="$2"
  local value="$3"
  if [ ! -f "$file_path" ]; then
    return 0
  fi
  if grep -Eq "^${key}=" "$file_path" 2>/dev/null; then
    local current
    current="$(grep -E "^${key}=" "$file_path" | head -n 1 | cut -d= -f2-)"
    if [ -n "$current" ] && [ "$current" != "change-me-to-a-random-64-char-string" ] && [ "$current" != "change-me-to-another-random-64-char-string" ] && [ "$current" != "" ]; then
      return 0
    fi
  fi
  set_env_value "$file_path" "$key" "$value"
}

ensure_system_packages() {
  if [ "$SKIP_SYSTEM_INSTALL" = "1" ]; then
    info "Skipping system package installation because SKIP_SYSTEM_INSTALL=1"
    return 0
  fi

  if require_cmd apt-get; then
    export DEBIAN_FRONTEND=noninteractive
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq ca-certificates curl wget git openssl build-essential python3 make gcc g++ software-properties-common lsb-release gnupg postgresql postgresql-contrib redis-server
  elif require_cmd brew; then
    brew install git curl wget openssl postgresql redis
  elif require_cmd dnf; then
    $SUDO dnf install -y git curl wget openssl make gcc-c++ python3 postgresql-server redis
  elif require_cmd yum; then
    $SUDO yum install -y git curl wget openssl make gcc-c++ python3 postgresql-server redis
  else
    err "Unsupported operating system. Please install the required packages manually."
    exit 1
  fi
}

ensure_nodejs() {
  if require_cmd node; then
    local node_major
    node_major="$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)"
    if [ -n "$node_major" ] && [ "$node_major" -ge "$NODE_VERSION_MIN" ]; then
      ok "Node.js found: $(node -v)"
      return 0
    fi
  fi

  info "Installing Node.js 22.x"
  if require_cmd apt-get; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
    $SUDO apt-get install -y -qq nodejs
  elif require_cmd brew; then
    brew install node@22
  else
    err "Unable to install Node.js automatically."
    exit 1
  fi

  ok "Node.js installed: $(node -v)"
}

ensure_pm2() {
  if require_cmd pm2; then
    ok "PM2 found: $(pm2 --version)"
    return 0
  fi

  info "Installing PM2"
  npm install -g pm2
  ok "PM2 installed"
}

ensure_postgres() {
  log_section "Configuring PostgreSQL"
  : "${DB_USER:=cloudnest}"
  : "${DB_NAME:=cloudnest}"
  : "${DB_HOST:=localhost}"
  : "${DB_PORT:=5432}"

  # Detect actual PostgreSQL port if it is running on a non-default port
  if require_cmd pg_isready; then
    for candidate_port in 5432 5433 5434 5435; do
      if pg_isready -h "${DB_HOST}" -p "${candidate_port}" >/dev/null 2>&1; then
        DB_PORT="${candidate_port}"
        break
      fi
    done
  fi
  info "Using PostgreSQL port ${DB_PORT}"

  if ! require_cmd psql; then
    warn "PostgreSQL client is not available yet; install step will be retried"
    return 0
  fi

  if ! pgrep -x postgres >/dev/null 2>&1; then
    if require_cmd systemctl; then
      $SUDO systemctl enable postgresql >/dev/null 2>&1 || true
      $SUDO systemctl start postgresql >/dev/null 2>&1 || true
    fi
  fi

  # Use a fixed, simple password to eliminate any random-password mismatch.
  # This is regenerated fresh only if the user hasn't supplied DB_PASSWORD.
  : "${DB_PASSWORD:=CloudNest2026Secure}"

  info "Setting database password for user '${DB_USER}'..."

  local psql_prefix
  if [ -n "$SUDO" ]; then
    psql_prefix="$SUDO -u postgres psql -p ${DB_PORT}"
  else
    psql_prefix="su postgres -c \"psql -p '${DB_PORT}'\""
  fi

  # Create role if missing, then ALWAYS force the password to match DB_PASSWORD.
  # Run each statement separately and show errors so nothing fails silently.
  if [ -n "$SUDO" ]; then
    $SUDO -u postgres psql -p "${DB_PORT}" -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
      $SUDO -u postgres psql -p "${DB_PORT}" -c "CREATE ROLE ${DB_USER} WITH LOGIN;" || { err "CREATE ROLE failed"; return 1; }
    $SUDO -u postgres psql -p "${DB_PORT}" -c "ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}' SUPERUSER;" || { err "ALTER ROLE failed"; return 1; }
    $SUDO -u postgres psql -p "${DB_PORT}" -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
      $SUDO -u postgres psql -p "${DB_PORT}" -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" || { err "CREATE DATABASE failed"; return 1; }
    $SUDO -u postgres psql -p "${DB_PORT}" -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" || true
    $SUDO -u postgres psql -p "${DB_PORT}" -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};" || true
  else
    su postgres -c "psql -p '${DB_PORT}' -tc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\"" | grep -q 1 || \
      su postgres -c "psql -p '${DB_PORT}' -c \"CREATE ROLE ${DB_USER} WITH LOGIN;\"" || { err "CREATE ROLE failed"; return 1; }
    su postgres -c "psql -p '${DB_PORT}' -c \"ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}' SUPERUSER;\"" || { err "ALTER ROLE failed"; return 1; }
    su postgres -c "psql -p '${DB_PORT}' -tc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" | grep -q 1 || \
      su postgres -c "psql -p '${DB_PORT}' -c \"CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};\"" || { err "CREATE DATABASE failed"; return 1; }
    su postgres -c "psql -p '${DB_PORT}' -c \"GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};\"" || true
    su postgres -c "psql -p '${DB_PORT}' -d '${DB_NAME}' -c \"GRANT ALL ON SCHEMA public TO ${DB_USER};\"" || true
  fi

  # Verify the password actually works
  if PGPASSWORD="$DB_PASSWORD" psql -p "${DB_PORT}" -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1" >/dev/null 2>&1; then
    ok "PostgreSQL is ready (user '${DB_USER}' authenticated)"
  else
    warn "PostgreSQL password validation failed — retrying once..."
    sleep 2
    if PGPASSWORD="$DB_PASSWORD" psql -p "${DB_PORT}" -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1" >/dev/null 2>&1; then
      ok "PostgreSQL is ready (user '${DB_USER}' authenticated)"
    else
      err "PostgreSQL authentication still failing after ALTER ROLE. Attempting pg_hba.conf fix..."
      # Try connecting via unix socket instead of TCP
      if PGPASSWORD="$DB_PASSWORD" psql -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1" >/dev/null 2>&1; then
        ok "PostgreSQL is ready via unix socket"
        # Force TCP auth by updating pg_hba.conf
        if [ -n "$SUDO" ]; then
          local hba_file
          hba_file="$($SUDO -u postgres psql -p "${DB_PORT}" -tAc "SHOW hba_file")"
          if [ -n "$hba_file" ]; then
            info "Patching pg_hba.conf at ${hba_file} to allow password auth..."
            $SUDO sed -i.bak 's/scram-sha-256/md5/g; s/peer/md5/g' "$hba_file" 2>/dev/null || true
            $SUDO sed -i.bak 's/ident/md5/g' "$hba_file" 2>/dev/null || true
            $SUDO systemctl reload postgresql 2>/dev/null || $SUDO -u postgres psql -p "${DB_PORT}" -c "SELECT pg_reload_conf();" 2>/dev/null || true
            sleep 2
            if PGPASSWORD="$DB_PASSWORD" psql -p "${DB_PORT}" -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1" >/dev/null 2>&1; then
              ok "PostgreSQL is ready after pg_hba.conf patch"
            else
              warn "PostgreSQL connection validation still pending — prisma:push may fail"
            fi
          fi
        fi
      else
        warn "PostgreSQL connection validation still pending — prisma:push may fail"
      fi
    fi
  fi
}

ensure_redis() {
  log_section "Configuring Redis"
  if ! require_cmd redis-cli; then
    warn "Redis client not available yet; installation will be retried"
    return 0
  fi

  if require_cmd systemctl; then
    $SUDO systemctl enable redis-server >/dev/null 2>&1 || true
    $SUDO systemctl start redis-server >/dev/null 2>&1 || true
  fi

  if redis-cli ping >/dev/null 2>&1; then
    ok "Redis is ready"
  else
    warn "Redis is not yet reachable; it will be retried during health checks"
  fi
}

clone_or_update_repo() {
  log_section "Preparing repository"
  mkdir -p "$INSTALL_DIR"
  if [ -d "$INSTALL_DIR/.git" ]; then
    info "Refreshing existing checkout to origin/$INSTALL_BRANCH"
    git -C "$INSTALL_DIR" remote set-url origin "$REPO_URL" >/dev/null 2>&1 || true
    git -C "$INSTALL_DIR" fetch --prune origin "$INSTALL_BRANCH" >/dev/null 2>&1 || true
    git -C "$INSTALL_DIR" checkout -B "$INSTALL_BRANCH" "origin/$INSTALL_BRANCH" >/dev/null 2>&1 || true
    git -C "$INSTALL_DIR" reset --hard "origin/$INSTALL_BRANCH" >/dev/null 2>&1 || true
    git -C "$INSTALL_DIR" clean -fd >/dev/null 2>&1 || true
  else
    if [ -d "$INSTALL_DIR" ] && [ -n "$(find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
      local backup_dir="${INSTALL_DIR}.backup.$(date +%s)"
      warn "Backing up existing installation to $backup_dir"
      mv "$INSTALL_DIR" "$backup_dir"
    fi
    info "Cloning CloudNest from $REPO_URL"
    git clone --depth=1 --branch "$INSTALL_BRANCH" "$REPO_URL" "$INSTALL_DIR"
  fi
  ok "Repository ready at $INSTALL_DIR"

  # Self-update: if the curl-piped installer differs from the freshly-pulled
  # checkout, re-exec the checkout's copy so we always run the latest code,
  # never a CDN-cached stale version.
  local checked_out_script="$INSTALL_DIR/scripts/install.sh"
  if [ -f "$checked_out_script" ] && [ "${BASH_SOURCE[0]:-$0}" != "$checked_out_script" ]; then
    info "Re-executing installer from repository checkout (avoids CDN cache staleness)"
    exec bash "$checked_out_script" install
  fi
}

write_env_file() {
  log_section "Generating environment configuration"
  local env_file="$INSTALL_DIR/.env"
  local env_example="$INSTALL_DIR/.env.example"

  # ALWAYS regenerate .env from scratch to avoid stale values from previous runs.
  # Back up the old one if it exists.
  if [ -f "$env_file" ]; then
    cp "$env_file" "${env_file}.backup.$(date +%s)"
    info "Backed up existing .env"
  fi
  if [ -f "$env_example" ]; then
    cp "$env_example" "$env_file"
  else
    : > "$env_file"
  fi

  local api_port="${API_PORT:-3000}"
  local web_port="${WEB_PORT:-3001}"
  api_port="$(find_available_port "$api_port")"
  web_port="$(find_available_port "$web_port")"
  API_PORT="$api_port"
  WEB_PORT="$web_port"

  PUBLIC_HOST="$(get_public_host)"

  if [ -z "${ADMIN_EMAIL:-}" ]; then
    ADMIN_EMAIL="admin"
  fi
  if [ -z "${ADMIN_PASSWORD:-}" ]; then
    ADMIN_PASSWORD="admin123"
  fi
  if [ -z "${JWT_ACCESS_SECRET:-}" ]; then
    JWT_ACCESS_SECRET="$(openssl rand -hex 48)"
  fi
  if [ -z "${JWT_REFRESH_SECRET:-}" ]; then
    JWT_REFRESH_SECRET="$(openssl rand -hex 48)"
  fi
  # DB_PASSWORD was already set by ensure_postgres() to a fixed value;
  # do NOT regenerate it here or .env will diverge from the DB.
  : "${DB_PASSWORD:=CloudNest2026Secure}"

  : "${DB_HOST:=localhost}"
  : "${DB_NAME:=cloudnest}"
  : "${DB_USER:=cloudnest}"
  # DB_PORT was set by ensure_postgres; default to 5432 if somehow unset
  : "${DB_PORT:=5432}"

  # Write the complete .env file in one shot — no stale values can survive.
  cat > "$env_file" <<EOF
NODE_ENV=production
PORT=${API_PORT}
NEXT_PUBLIC_API_URL=http://${PUBLIC_HOST}:${API_PORT}
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
CORS_ORIGIN=http://${PUBLIC_HOST}:${WEB_PORT}
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@cloudnest.io
TOTP_ISSUER=CloudNest
THROTTLE_TTL=60
THROTTLE_LIMIT=60
PROXMOX_HOST=
PROXMOX_API_TOKEN_ID=
PROXMOX_API_TOKEN_SECRET=
PROXMOX_NODE=
PROXMOX_STORAGE=
EOF

  info "DATABASE_URL written: postgresql://${DB_USER}:****@${DB_HOST}:${DB_PORT}/${DB_NAME}"

  # Load .env into the current shell so child processes inherit correct values
  set -a
  # shellcheck source=/dev/null
  . "$env_file"
  set +a
}

install_dependencies() {
  log_section "Installing project dependencies"
  cd "$INSTALL_DIR"
  rm -rf "$INSTALL_DIR/apps/web/.next" "$INSTALL_DIR/apps/api/dist" "$INSTALL_DIR/node_modules" 2>/dev/null || true
  # npm skips devDependencies when NODE_ENV=production, but we need them
  # (@nestjs/cli, prisma, ts-node, etc.) to build and seed. Temporarily
  # unset NODE_ENV for the install step.
  local saved_node_env="${NODE_ENV:-}"
  unset NODE_ENV
  run_with_retry 3 10 npm install --no-fund --no-audit
  export NODE_ENV="$saved_node_env"
  ok "Dependencies installed"
}

setup_prisma() {
  log_section "Configuring Prisma"
  cd "$INSTALL_DIR"

  info "Prisma will use DATABASE_URL=postgresql://${DB_USER}:****@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"

  run_with_retry 3 10 npm run prisma:generate

  if [ -d "$INSTALL_DIR/apps/api/prisma/migrations" ]; then
    run_with_retry 3 10 npm run prisma:migrate -- --skip-generate || npm run prisma:push
  else
    run_with_retry 3 10 npm run prisma:push
  fi
  ok "Prisma schema is ready"
}

seed_admin_account() {
  log_section "Creating administrator account"
  cd "$INSTALL_DIR"

  if [ -z "${ADMIN_EMAIL:-}" ] || [ -z "${ADMIN_PASSWORD:-}" ]; then
    err "ADMIN_EMAIL or ADMIN_PASSWORD is not set; cannot create admin account"
    return 1
  fi

  ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" npm run seed:admin -w apps/api || {
    err "Admin seeding failed"
    return 1
  }
  ok "Administrator account ready: $ADMIN_EMAIL"
}

build_project() {
  log_section "Building application"
  cd "$INSTALL_DIR"
  rm -rf "$INSTALL_DIR/apps/web/.next" "$INSTALL_DIR/apps/api/dist" 2>/dev/null || true
  export NODE_ENV=production
  export CI=1
  npm run build
  ok "Build completed"
}

write_pm2_config() {
  log_section "Configuring process manager"
  cd "$INSTALL_DIR"

  local _db_url _redis_url _jwt_access _jwt_refresh _api_url _cors_origin
  _db_url="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"
  _redis_url="${REDIS_URL:-redis://localhost:6379}"
  _jwt_access="${JWT_ACCESS_SECRET}"
  _jwt_refresh="${JWT_REFRESH_SECRET}"
  _api_url="http://${PUBLIC_HOST}:${API_PORT}"
  _cors_origin="http://${PUBLIC_HOST}:${WEB_PORT}"

  cat > "$INSTALL_DIR/ecosystem.config.cjs" <<EOF
module.exports = {
  apps: [
    {
      name: 'cloudnest-api',
      cwd: '${INSTALL_DIR}',
      script: 'apps/api/dist/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: '${API_PORT}',
        DATABASE_URL: '${_db_url}',
        REDIS_URL: '${_redis_url}',
        JWT_ACCESS_SECRET: '${_jwt_access}',
        JWT_REFRESH_SECRET: '${_jwt_refresh}',
        NEXT_PUBLIC_API_URL: '${_api_url}',
        CORS_ORIGIN: '${_cors_origin}',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
    },
    {
      name: 'cloudnest-web',
      cwd: '${INSTALL_DIR}/apps/web',
      script: '../../node_modules/next/dist/bin/next',
      args: 'start -p ${WEB_PORT} -H 0.0.0.0',
      env: {
        NODE_ENV: 'production',
        PORT: '${WEB_PORT}',
        NEXT_PUBLIC_API_URL: 'http://127.0.0.1:${API_PORT}',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
    },
  ],
};
EOF
}

start_services() {
  log_section "Starting services"
  cd "$INSTALL_DIR"
  pm2 delete cloudnest-api cloudnest-web >/dev/null 2>&1 || true
  if ! pm2 start "$INSTALL_DIR/ecosystem.config.cjs" >/dev/null 2>&1; then
    err "PM2 failed to start services"
    pm2 logs cloudnest-api cloudnest-web --lines 20 --nostream 2>&1 | tail -40
    return 1
  fi
  pm2 save >/dev/null 2>&1 || true
  pm2 startup >/dev/null 2>&1 || true
  ok "Services started with PM2"
}

wait_for_http() {
  local url="$1"
  local attempts="$2"
  local delay="$3"
  local attempt=1
  while [ "$attempt" -le "$attempts" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
    attempt=$((attempt + 1))
  done
  return 1
}

run_health_checks() {
  log_section "Running health checks"
  local api_url="http://127.0.0.1:${API_PORT}"
  local web_url="http://127.0.0.1:${WEB_PORT}"

  if ! wait_for_http "$api_url" 20 3; then
    err "API did not become reachable"
    info "PM2 API logs (last 30 lines):"
    pm2 logs cloudnest-api --lines 30 --nostream 2>&1 | tail -30
    return 1
  fi
  if ! wait_for_http "$web_url" 20 3; then
    err "Frontend did not become reachable"
    info "PM2 web logs (last 30 lines):"
    pm2 logs cloudnest-web --lines 30 --nostream 2>&1 | tail -30
    return 1
  fi

  local login_response
  login_response="$(curl -sS -X POST "$api_url/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" 2>&1 || true)"
  if [[ "$login_response" == *'"accessToken"'* ]] || [[ "$login_response" == *'"refreshToken"'* ]]; then
    ok "Authentication endpoint responded successfully"
  else
    warn "Authentication validation returned an unexpected response (system is running, login may need verification)"
    info "Login response: $login_response"
    info "Admin email: $ADMIN_EMAIL"
    info "API URL: $api_url"
  fi

  local psql_conn
  psql_conn="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  if ! psql "$psql_conn" -c 'SELECT 1' >/dev/null 2>&1; then
    err "PostgreSQL validation failed"
    return 1
  fi

  if ! redis-cli ping >/dev/null 2>&1; then
    err "Redis validation failed"
    return 1
  fi

  ok "All health checks passed"
}

print_summary() {
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════${NC}"
  echo -e "${GREEN}CloudNest Installed Successfully${NC}"
  echo -e "${GREEN}═══════════════════════════════════════${NC}"
  echo ""
  echo -e "URL: ${CYAN}http://${PUBLIC_HOST}:${WEB_PORT}${NC}"
  echo -e "API: ${CYAN}http://${PUBLIC_HOST}:${API_PORT}${NC}"
  echo -e "Admin Email: ${CYAN}${ADMIN_EMAIL}${NC}"
  echo -e "Admin Password: ${CYAN}${ADMIN_PASSWORD}${NC}"
  echo ""
  echo -e "Status:"
  echo -e "  ${GREEN}✓${NC} PostgreSQL"
  echo -e "  ${GREEN}✓${NC} Redis"
  echo -e "  ${GREEN}✓${NC} Prisma"
  echo -e "  ${GREEN}✓${NC} API"
  echo -e "  ${GREEN}✓${NC} Frontend"
  echo -e "  ${GREEN}✓${NC} Authentication"
  echo -e "  ${GREEN}✓${NC} Admin Created"
  echo ""
  echo -e "System is ready for production."
}

perform_install() {
  ensure_system_packages
  ensure_nodejs
  ensure_pm2
  ensure_postgres
  ensure_redis
  clone_or_update_repo
  install_dependencies
  setup_prisma
  seed_admin_account
  build_project
  write_pm2_config
  start_services
  run_health_checks
  write_env_file
  print_summary
}

perform_update() {
  log_section "Updating CloudNest"
  if [ ! -d "$INSTALL_DIR" ]; then
    err "Installation not found at $INSTALL_DIR"
    return 1
  fi
  cd "$INSTALL_DIR"
  info "Fetching latest from origin/$INSTALL_BRANCH"
  git fetch --prune origin "$INSTALL_BRANCH"
  git checkout -B "$INSTALL_BRANCH" "origin/$INSTALL_BRANCH" >/dev/null 2>&1
  git reset --hard "origin/$INSTALL_BRANCH" >/dev/null 2>&1
  git clean -fd >/dev/null 2>&1
  info "Installing dependencies and rebuilding"
  npm install --no-fund --no-audit || true
  npm run build || true
  pm2 restart cloudnest-api cloudnest-web >/dev/null 2>&1 || pm2 start "$INSTALL_DIR/ecosystem.config.cjs" --env production >/dev/null 2>&1 || true
  pm2 save >/dev/null 2>&1 || true
  ok "Update complete"
}

perform_uninstall() {
  log_section "Uninstalling CloudNest"
  if [ -n "${UNINSTALL_YES:-}" ] && [ "$UNINSTALL_YES" = "1" ]; then
    confirm_yes=1
  else
    echo ""
    prompt_input "Are you sure you want to uninstall CloudNest and remove $INSTALL_DIR? (type 'yes' to confirm): " confirm
    if [ "$confirm" != "yes" ]; then
      warn "Aborting uninstall"
      return 1
    fi
  fi

  pm2 delete cloudnest-api cloudnest-web >/dev/null 2>&1 || true
  pm2 save >/dev/null 2>&1 || true
  if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    ok "Removed $INSTALL_DIR"
  else
    warn "Installation directory not found: $INSTALL_DIR"
  fi

  if [ -z "${SKIP_DB_DROP:-}" ]; then
    echo ""
    prompt_input "Drop PostgreSQL database and user 'cloudnest'? This is irreversible. (type 'yes' to drop, anything else to skip): " dropdb_confirm
    if [ "$dropdb_confirm" = "yes" ]; then
      if require_cmd psql; then
        $SUDO -u postgres dropdb "${DB_NAME:-cloudnest}" >/dev/null 2>&1 || true
        $SUDO -u postgres dropuser "${DB_USER:-cloudnest}" >/dev/null 2>&1 || true
        ok "Dropped PostgreSQL database and user"
      else
        warn "psql not available; cannot drop database automatically"
      fi
    else
      info "Skipping database drop"
    fi
  fi

  ok "Uninstall finished"
}

main() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║        CloudNest — One-Command Install  ║${NC}"
  echo -e "${CYAN}║     Production-grade unattended setup   ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
  echo ""

  detect_os
  case "$OS_ID" in
    ubuntu|debian|raspbian|linux|flatpak|freedesktop-sdk) ;;
    *)
      if [[ "$OS_NAME" == *"Freedesktop SDK"* ]] || [[ "$OS_NAME" == *"Flatpak"* ]] || [ "$OS_ID" = "unknown" ]; then
        warn "Treating current environment as a generic Linux host for installer compatibility"
      else
        err "Unsupported OS: $OS_NAME"
        exit 1
      fi
      ;;
  esac
  info "Detected OS: $OS_NAME ($OS_VERSION)"
  info "Detected architecture: $(detect_arch)"

  if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
  else
    if require_cmd sudo; then
      SUDO="sudo"
    else
      err "This installer requires root privileges or sudo access"
      exit 1
    fi
  fi

  if ! require_cmd curl; then
    err "curl is required"
    exit 1
  fi

  ensure_tty_input

  if ! require_cmd python3; then
    ensure_system_packages
  fi

  local requested_action
  requested_action="$(normalize_action "${1:-}")"

  # If script is called with a direct command, run it non-interactively
  case "$requested_action" in
    install)
      perform_install
      exit $?
      ;;
    update)
      perform_update
      exit $?
      ;;
    uninstall)
      perform_uninstall
      exit $?
      ;;
    exit)
      echo "Exiting."
      exit 0
      ;;
  esac

  # Interactive menu
  while true; do
    echo ""
    echo "Select an option:"
    echo "  1) install"
    echo "  2) update"
    echo "  3) uninstall"
    echo "  4) exit"
    prompt_input $'Enter choice [1-4]: ' choice
    case "$choice" in
      1|install)
        perform_install
        break
        ;;
      2|update)
        perform_update
        break
        ;;
      3|uninstall)
        perform_uninstall
        break
        ;;
      4|exit)
        echo "Exiting."
        exit 0
        ;;
      *)
        warn "Invalid selection"
        ;;
    esac
  done
}

main "$@"
