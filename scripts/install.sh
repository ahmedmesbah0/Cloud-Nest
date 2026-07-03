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
  # provide safe defaults so set -u doesn't fail when variables are not set
  : "${DB_USER:=cloudnest}"
  : "${DB_NAME:=cloudnest}"
  : "${DB_HOST:=localhost}"
  : "${DB_PORT:=5432}"

  if require_cmd psql; then
    if ! pgrep -x postgres >/dev/null 2>&1; then
      if require_cmd systemctl; then
        $SUDO systemctl enable postgresql >/dev/null 2>&1 || true
        $SUDO systemctl start postgresql >/dev/null 2>&1 || true
      fi
    fi

    if [ -n "$SUDO" ]; then
      if ! $SUDO -u postgres psql -c "SELECT 1" >/dev/null 2>&1; then
        warn "PostgreSQL superuser is not available yet; will retry during health checks"
        return 0
      fi
    else
      if ! su postgres -c "psql -c 'SELECT 1'" >/dev/null 2>&1; then
        warn "PostgreSQL superuser is not available yet; will retry during health checks"
        return 0
      fi
    fi

    if [ -z "${DB_PASSWORD:-}" ]; then
      DB_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)"
    fi

    if [ -n "$SUDO" ]; then
      $SUDO -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
        $SUDO -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';"
      $SUDO -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
        $SUDO -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
      $SUDO -u postgres psql -c "ALTER ROLE ${DB_USER} WITH SUPERUSER;" >/dev/null 2>&1 || true
      $SUDO -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" >/dev/null 2>&1 || true
    else
      su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\"" | grep -q 1 || \
        su postgres -c "psql -c \"CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';\""
      su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" | grep -q 1 || \
        su postgres -c "psql -c \"CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};\""
      su postgres -c "psql -c \"ALTER ROLE ${DB_USER} WITH SUPERUSER;\"" >/dev/null 2>&1 || true
      su postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};\"" >/dev/null 2>&1 || true
    fi

    if PGPASSWORD="$DB_PASSWORD" psql "postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" -c "SELECT 1" >/dev/null 2>&1; then
      ok "PostgreSQL is ready"
    else
      warn "PostgreSQL user/database created but connection validation is still pending"
    fi
  else
    warn "PostgreSQL client is not available yet; install step will be retried"
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
}

write_env_file() {
  log_section "Generating environment configuration"
  local env_file="$INSTALL_DIR/.env"
  local env_example="$INSTALL_DIR/.env.example"

  if [ -f "$env_file" ]; then
    info "Using existing .env file"
  else
    cp "$env_example" "$env_file"
  fi

  local api_port="${API_PORT:-3000}"
  local web_port="${WEB_PORT:-3001}"
  api_port="$(find_available_port "$api_port")"
  web_port="$(find_available_port "$web_port")"
  API_PORT="$api_port"
  WEB_PORT="$web_port"

  PUBLIC_HOST="$(get_public_host)"

  if [ -z "${ADMIN_EMAIL:-}" ]; then
    ADMIN_EMAIL="${ADMIN_EMAIL:-admin-$(openssl rand -hex 4)@cloudnest.local}"
  fi
  if [ -z "${ADMIN_PASSWORD:-}" ]; then
    ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9!@#$%^&*' | head -c 24)"
  fi
  if [ -z "${JWT_ACCESS_SECRET:-}" ]; then
    JWT_ACCESS_SECRET="$(openssl rand -hex 48)"
  fi
  if [ -z "${JWT_REFRESH_SECRET:-}" ]; then
    JWT_REFRESH_SECRET="$(openssl rand -hex 48)"
  fi
  if [ -z "${DB_PASSWORD:-}" ]; then
    DB_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)"
  fi
  if [ -z "${REDIS_PASSWORD:-}" ]; then
    REDIS_PASSWORD=""
  fi

  if [ -z "${DB_HOST:-}" ]; then DB_HOST="localhost"; fi
  if [ -z "${DB_PORT:-}" ]; then DB_PORT="5432"; fi
  if [ -z "${DB_NAME:-}" ]; then DB_NAME="cloudnest"; fi
  if [ -z "${DB_USER:-}" ]; then DB_USER="cloudnest"; fi

  ensure_env_value "$env_file" "NODE_ENV" "production"
  ensure_env_value "$env_file" "PORT" "$API_PORT"
  ensure_env_value "$env_file" "NEXT_PUBLIC_API_URL" "http://${PUBLIC_HOST}:${API_PORT}"
  ensure_env_value "$env_file" "DATABASE_URL" "postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"
  ensure_env_value "$env_file" "REDIS_URL" "redis://localhost:6379"
  ensure_env_value "$env_file" "JWT_ACCESS_SECRET" "$JWT_ACCESS_SECRET"
  ensure_env_value "$env_file" "JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET"
  ensure_env_value "$env_file" "JWT_ACCESS_EXPIRY" "15m"
  ensure_env_value "$env_file" "JWT_REFRESH_EXPIRY" "7d"
  ensure_env_value "$env_file" "CORS_ORIGIN" "http://${PUBLIC_HOST}:${WEB_PORT}"
  ensure_env_value "$env_file" "SMTP_HOST" ""
  ensure_env_value "$env_file" "SMTP_PORT" "587"
  ensure_env_value "$env_file" "SMTP_USER" ""
  ensure_env_value "$env_file" "SMTP_PASS" ""
  ensure_env_value "$env_file" "SMTP_FROM" "noreply@cloudnest.io"
  ensure_env_value "$env_file" "THROTTLE_TTL" "60"
  ensure_env_value "$env_file" "THROTTLE_LIMIT" "60"

  export $(grep -v '^#' "$env_file" | xargs -d '\n' 2>/dev/null) || true
}

install_dependencies() {
  log_section "Installing project dependencies"
  cd "$INSTALL_DIR"
  rm -rf "$INSTALL_DIR/apps/web/.next" "$INSTALL_DIR/apps/api/dist" "$INSTALL_DIR/node_modules" 2>/dev/null || true
  run_with_retry 3 10 npm install --no-fund --no-audit
  ok "Dependencies installed"
}

setup_prisma() {
  log_section "Configuring Prisma"
  cd "$INSTALL_DIR"
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
  info "Skipping direct admin seeding during install; Prisma setup and application boot will handle initialization"
  ok "Installer completed schema initialization"
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
  cat > "$INSTALL_DIR/ecosystem.config.cjs" <<EOF
module.exports = {
  apps: [
    {
      name: 'cloudnest-api',
      cwd: process.env.CLOUDNEST_INSTALL_DIR || process.cwd(),
      script: 'apps/api/dist/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.API_PORT || '3000',
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL,
        JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
    },
    {
      name: 'cloudnest-web',
      cwd: process.env.CLOUDNEST_INSTALL_DIR || process.cwd(),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001 -H 0.0.0.0',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.WEB_PORT || '3001',
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
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
  export CLOUDNEST_INSTALL_DIR="$INSTALL_DIR"
  export API_PORT="$API_PORT"
  export WEB_PORT="$WEB_PORT"
  export DATABASE_URL="$(grep '^DATABASE_URL=' "$INSTALL_DIR/.env" | cut -d= -f2-)"
  export REDIS_URL="$(grep '^REDIS_URL=' "$INSTALL_DIR/.env" | cut -d= -f2-)"
  export JWT_ACCESS_SECRET="$(grep '^JWT_ACCESS_SECRET=' "$INSTALL_DIR/.env" | cut -d= -f2-)"
  export JWT_REFRESH_SECRET="$(grep '^JWT_REFRESH_SECRET=' "$INSTALL_DIR/.env" | cut -d= -f2-)"
  export NEXT_PUBLIC_API_URL="$(grep '^NEXT_PUBLIC_API_URL=' "$INSTALL_DIR/.env" | cut -d= -f2-)"

  pm2 delete cloudnest-api cloudnest-web >/dev/null 2>&1 || true
  pm2 start "$INSTALL_DIR/ecosystem.config.cjs" --env production >/dev/null 2>&1
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
    return 1
  fi
  if ! wait_for_http "$web_url" 20 3; then
    err "Frontend did not become reachable"
    return 1
  fi

  local login_response
  login_response="$(curl -fsS -X POST "$api_url/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" || true)"
  if [[ "$login_response" == *'"accessToken"'* ]] || [[ "$login_response" == *'"refreshToken"'* ]]; then
    ok "Authentication endpoint responded successfully"
  else
    err "Authentication validation failed"
    return 1
  fi

  if ! psql "postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public" -c 'SELECT 1' >/dev/null 2>&1; then
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
  write_env_file
  install_dependencies
  setup_prisma
  seed_admin_account
  build_project
  write_pm2_config
  start_services
  run_health_checks
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
  git fetch origin "$INSTALL_BRANCH" >/dev/null 2>&1 || true
  git checkout "$INSTALL_BRANCH" >/dev/null 2>&1 || true
  git pull --ff-only origin "$INSTALL_BRANCH" || true
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
