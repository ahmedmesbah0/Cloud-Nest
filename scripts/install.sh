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

# ─── Prerequisites check ────────────────────────────────────
info "Checking prerequisites..."

command -v git  >/dev/null 2>&1 || { err "git is required but not installed."; exit 1; }
ok "git found: $(git --version | head -1)"

command -v node >/dev/null 2>&1 || { err "Node.js is required but not installed."; exit 1; }
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt "$NODE_VERSION_MIN" ]; then
  err "Node.js >= $NODE_VERSION_MIN required (found: $(node -v))"
  exit 1
fi
ok "Node.js found: $(node -v)"

command -v npm >/dev/null 2>&1 || { err "npm is required but not installed."; exit 1; }
ok "npm found: $(npm -v)"

# Optional services check
HAS_PSQL=false; HAS_REDIS=false
command -v psql    >/dev/null 2>&1 && HAS_PSQL=true
command -v redis-cli >/dev/null 2>&1 && HAS_REDIS=true

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
  ok "JWT secrets generated and written to .env"
  echo ""
  echo -e "${YELLOW}  ─── Manual configuration required ───${NC}"
  echo -e "  Open ${CYAN}$INSTALL_DIR/.env${NC} and set:"
  echo -e "    DATABASE_URL     (PostgreSQL connection string)"
  echo -e "    REDIS_URL        (Redis connection string)"
  echo -e "    PROXMOX_HOST     (your Proxmox VE host)"
  echo -e "    PROXMOX_API_TOKEN_ID / PROXMOX_API_TOKEN_SECRET"
  echo -e "    SMTP_*           (for email verification)"
  echo ""
  echo -e "  Default DATABASE_URL: postgresql://cloudnest:cloudnest@localhost:5432/cloudnest"
  echo -e "  Default REDIS_URL:    redis://localhost:6379"
  echo ""

  read -r -p "  Edit .env now? [y/N] " EDIT_ENV
  if [[ "$EDIT_ENV" =~ ^[Yy] ]]; then
    ${EDITOR:-nano} .env
  fi
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
echo -e "  ${YELLOW}API Documentation:${NC}"
echo -e "    http://localhost:3000/api/docs"
echo ""
echo -e "  ${YELLOW}Admin seed (first run):${NC}"
echo -e "    npm run seed:admin"
echo ""
echo -e "  ${YELLOW}Proxmox test (verify VM operations):${NC}"
echo -e "    npm run proxmox:test-vm"
echo ""
echo -e "  ${CYAN}Need help?${NC} https://github.com/ahmedmesbah0/Cloud-Nest/issues"
echo ""
