#!/usr/bin/env bash
set -euo pipefail

# ─── CloudNest Database Restore ────────────────────────────
# Reads DATABASE_URL from .env, restores from a backup file.
# Usage: ./scripts/restore.sh <backup-file>

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file>" >&2
  echo "Example: $0 backups/cloudnest_20250401_120000.sql" >&2
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

# Load DATABASE_URL from .env if present
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set. Create a .env file or export it." >&2
  exit 1
fi

echo "WARNING: This will DROP all existing data and restore from backup."
read -r -p "Are you sure? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy] ]]; then
  echo "Cancelled."
  exit 0
fi

echo "Restoring CloudNest database from $BACKUP_FILE ..."
psql "$DATABASE_URL" -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = current_database() AND pid <> pg_backend_pid()" 2>/dev/null || true
psql "$DATABASE_URL" < "$BACKUP_FILE"
echo "Restore complete."
