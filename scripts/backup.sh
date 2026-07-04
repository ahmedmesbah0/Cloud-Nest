#!/usr/bin/env bash
set -euo pipefail

# ─── CloudNest Database Backup ─────────────────────────────
# Reads DATABASE_URL from .env, dumps to timestamped file.
# Usage: ./scripts/backup.sh [output-dir]
#   --install-cron   Install a daily cron job for automatic backup
#   --encrypt-key    GPG key ID for encrypting backups
#   --retention N    Number of backups to keep (default: 30)
# Default output dir: ./backups/

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${1:-$SCRIPT_DIR/backups}"
RETENTION=30
ENCRYPT_KEY=""
INSTALL_CRON=false

# Parse flags (any order after first positional arg)
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --retention=*) RETENTION="${arg#*=}" ;;
    --encrypt-key=*) ENCRYPT_KEY="${arg#*=}" ;;
    --install-cron) INSTALL_CRON=true ;;
    --*) echo "Unknown option: $arg" >&2; exit 1 ;;
    *) ARGS+=("$arg") ;;
  esac
done
if [ ${#ARGS[@]} -gt 0 ]; then
  OUTPUT_DIR="${ARGS[0]}"
fi

mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$OUTPUT_DIR/cloudnest_$TIMESTAMP.sql"

# Load DATABASE_URL from .env if present
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set. Create a .env file or export it." >&2
  exit 1
fi

echo "Backing up CloudNest database..."
pg_dump "$DATABASE_URL" --no-owner --no-acl > "$BACKUP_FILE"
echo "Backup saved: $BACKUP_FILE"
echo "Size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Encrypt with GPG if key provided
if [ -n "$ENCRYPT_KEY" ]; then
  if command -v gpg &>/dev/null; then
    gpg --yes --batch --encrypt --recipient "$ENCRYPT_KEY" "$BACKUP_FILE"
    rm -f "$BACKUP_FILE"
    echo "Encrypted: ${BACKUP_FILE}.gpg"
  else
    echo "WARNING: gpg not installed, skipping encryption" >&2
  fi
fi

# Rotate old backups (keep last RETENTION)
if [ "$RETENTION" -gt 0 ]; then
  ls -1tr "$OUTPUT_DIR"/cloudnest_*.sql* 2>/dev/null | head -n -"$RETENTION" | while read -r old; do
    rm -f "$old"
    echo "Removed old backup: $old"
  done
fi

# Install cron job if requested
if [ "$INSTALL_CRON" = true ]; then
  CRON_SCHED="${CRON_SCHED:-0 4 * * *}"
  CRON_LINE="$CRON_SCHED cd '$SCRIPT_DIR' && bash '$0' '$OUTPUT_DIR'"
  if command -v crontab &>/dev/null; then
    (crontab -l 2>/dev/null || true; echo "$CRON_LINE") | crontab -
    echo "Cron job installed: $CRON_SCHED"
  else
    echo "WARNING: crontab not available, cron not installed" >&2
  fi
fi
