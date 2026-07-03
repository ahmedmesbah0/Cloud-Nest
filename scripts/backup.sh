#!/usr/bin/env bash
set -euo pipefail

# ─── CloudNest Database Backup ─────────────────────────────
# Reads DATABASE_URL from .env, dumps to timestamped file.
# Usage: ./scripts/backup.sh [output-dir]
# Default output dir: ./backups/

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${1:-$SCRIPT_DIR/backups}"
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
