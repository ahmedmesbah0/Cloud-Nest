#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/ahmedmesbah0/Cloud-Nest"
INSTALL_DIR="${INSTALL_DIR:-$HOME/cloudnest}"
NODE_VERSION_MIN="18"

# ─── Color helpers ──────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERR]${NC}   $*" >&2; }

# ─── Header ─────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║        CloudNest — One-Click Install     ║${NC}"
echo -e "${CYAN}║     Self-Service VPS Hosting Platform    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ─── Auto-install helpers ───────────────────────────────────
install_pkg() {
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y -qq "$@"
  elif command -v brew >/dev/null 2>&1; then
    brew install "$@"
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y "$@"
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y "$@"
  elif command -v apk >/dev/null 2>&1; then
    sudo apk add "$@"
  else
    err "No package manager found (apt/brew/dnf/yum/apk). Please install $* manually."
    exit 1
  fi
}

# ─── Prerequisites check ────────────────────────────────────
info "Checking prerequisites..."

# Git
if ! command -v git >/dev/null 2>&1; then
  warn "git not found — installing..."
  install_pkg git
fi
ok "git found: $(git --version | head -1)"

# Node.js
if ! command -v node >/dev/null 2>&1; then
  warn "Node.js not found — installing..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y -qq nodejs
  elif command -v brew >/dev/null 2>&1; then
    brew install node@22
  else
    err "Please install Node.js >= $NODE_VERSION_MIN from https://nodejs.org"
    exit 1
  fi
fi
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt "$NODE_VERSION_MIN" ]; then
  err "Node.js >= $NODE_VERSION_MIN required (found: $(node -v))"
  exit 1
fi
ok "Node.js found: $(node -v)"

# npm
if ! command -v npm >/dev/null 2>&1; then
  err "npm not found. Try reinstalling Node.js."
  exit 1
fi
ok "npm found: $(npm -v)"

echo ""

# ─── Admin credentials ──────────────────────────────────────
echo -e "${CYAN}─── Admin Account ─────────────────────────────${NC}"
echo -e "Create the initial administrator account.\n"

read -r -p "Admin email: " ADMIN_EMAIL
while [ -z "$ADMIN_EMAIL" ]; do
  read -r -p "Admin email (required): " ADMIN_EMAIL
done

read -r -s -p "Admin password: " ADMIN_PASSWORD
echo ""
while [ -z "$ADMIN_PASSWORD" ]; do
  read -r -s -p "Admin password (required): " ADMIN_PASSWORD
  echo ""
done
read -r -s -p "Confirm password: " ADMIN_PASSWORD_CONFIRM
echo ""
if [ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]; then
  err "Passwords do not match."
  exit 1
fi

echo ""

# ─── Clone or pull ──────────────────────────────────────────
if [ -d "$INSTALL_DIR" ]; then
  warn "Directory $INSTALL_DIR already exists."
  read -r -p "  Pull latest changes? [Y/n] " PULL_ANS
  if [[ "$PULL_ANS" =~ ^[Nn] ]]; then
    info "Using existing code as-is."
  else
    info "Pulling latest changes..."
    git -C "$INSTALL_DIR" pull --rebase
    ok "Repository updated."
  fi
else
  info "Cloning CloudNest from $REPO_URL ..."
  git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"
  ok "Repository cloned to $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ─── Database setup ─────────────────────────────────────────
echo -e "${CYAN}─── Database Setup ────────────────────────────${NC}"

# Detect local PostgreSQL
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="cloudnest"
DB_USER="cloudnest"
DB_PASS="cloudnest"

if command -v psql >/dev/null 2>&1; then
  info "PostgreSQL client found. Attempting automatic setup..."

  # Try to connect as postgres superuser
  if sudo -u postgres psql -c "SELECT 1" >/dev/null 2>&1; then
    info "Creating database user and database..."

    # Create user if not exists
    sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
      sudo -u postgres psql -c "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';"

    # Create database if not exists
    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
      sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

    # Grant permissions
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

    DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME"
    ok "PostgreSQL database '$DB_NAME' created."
  else
    warn "Could not connect as 'postgres' user. You will need to configure DATABASE_URL manually."
    DATABASE_URL=""
  fi
else
  warn "PostgreSQL not found. Install it or configure DATABASE_URL manually."
  warn "  Ubuntu/Debian: sudo apt-get install postgresql postgresql-contrib"
  warn "  macOS:         brew install postgresql@16"
  DATABASE_URL=""
fi

# Redis check
if ! command -v redis-cli >/dev/null 2>&1; then
  warn "Redis not found. Install it or configure REDIS_URL manually."
  warn "  Ubuntu/Debian: sudo apt-get install redis-server"
  warn "  macOS:         brew install redis"
fi
echo ""

# ─── .env setup ─────────────────────────────────────────────
if [ -f .env ]; then
  warn ".env already exists — skipping generation."
else
  info "Creating .env from .env.example ..."
  cp .env.example .env

  # Auto-generate JWT secrets
  JWT_ACCESS=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  JWT_REFRESH=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/JWT_ACCESS_SECRET=change-me-to-a-random-64-char-string/JWT_ACCESS_SECRET=$JWT_ACCESS/" .env
    sed -i '' "s/JWT_REFRESH_SECRET=change-me-to-another-random-64-char-string/JWT_REFRESH_SECRET=$JWT_REFRESH/" .env
  else
    sed -i "s/JWT_ACCESS_SECRET=change-me-to-a-random-64-char-string/JWT_ACCESS_SECRET=$JWT_ACCESS/" .env
    sed -i "s/JWT_REFRESH_SECRET=change-me-to-another-random-64-char-string/JWT_REFRESH_SECRET=$JWT_REFRESH/" .env
  fi
  ok "JWT secrets generated."

  # Set DATABASE_URL if we auto-created the DB
  if [ -n "$DATABASE_URL" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|postgresql://.*|$DATABASE_URL|" .env
    else
      sed -i "s|postgresql://.*|$DATABASE_URL|" .env
    fi
    ok "DATABASE_URL configured for local PostgreSQL."
  fi

  info "Proxmox and SMTP settings can be configured later from the admin dashboard."
fi

# ─── Install dependencies ───────────────────────────────────
info "Installing npm dependencies..."
npm install
ok "Dependencies installed."

# ─── Prisma ─────────────────────────────────────────────────
info "Generating Prisma client..."
npm run prisma:generate
ok "Prisma client generated."

info "Pushing database schema..."
if npm run prisma:push 2>&1; then
  ok "Database schema synced."
else
  warn "Database push failed. Make sure PostgreSQL is running and DATABASE_URL in .env is correct."
  warn "You can run 'npm run prisma:push' later after fixing .env."
fi

# ─── Seed admin ─────────────────────────────────────────────
info "Creating admin account..."
ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" npx ts-node apps/api/src/seed/seed-admin.ts || \
  warn "Admin seed failed — you can run it manually later:"
  warn "  ADMIN_EMAIL=your@email.com ADMIN_PASSWORD=yourpass npx ts-node apps/api/src/seed/seed-admin.ts"
ok "Admin account created."

# ─── Build ──────────────────────────────────────────────────
info "Building project..."
npm run build 2>&1 | tail -5
ok "Build complete."

# ─── Done ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        CloudNest installed!              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Install directory: ${CYAN}$INSTALL_DIR${NC}"
echo ""
echo -e "  ${YELLOW}Start development servers:${NC}"
echo -e "    cd $INSTALL_DIR"
echo -e "    npm run dev"
echo ""
echo -e "  ${YELLOW}Or start individually:${NC}"
echo -e "    npm run dev:api     # Backend (port 3000)"
echo -e "    npm run dev:web     # Frontend (port 3001)"
echo ""
echo -e "  ${YELLOW}Admin login:${NC}"
echo -e "    Email:    ${CYAN}$ADMIN_EMAIL${NC}"
echo -e "    Password: ${CYAN}(your chosen password)${NC}"
echo ""
echo -e "  ${YELLOW}After logging in:${NC}"
echo -e "    1. Go to ${CYAN}Dashboard → Admin${NC}"
echo -e "    2. Configure Proxmox VE connection"
echo -e "    3. Configure SMTP for email sending"
echo ""
echo -e "  ${YELLOW}API Documentation:${NC}"
echo -e "    http://localhost:3000/api/docs"
echo ""
echo -e "  ${CYAN}Need help?${NC} https://github.com/ahmedmesbah0/Cloud-Nest/issues"
echo ""
