# CloudNest Security Checklist

## Authentication & Authorization
- [x] JWT access tokens (short-lived, 15m default)
- [x] Rotating refresh tokens (7d expiry)
- [x] Argon2 password hashing
- [x] Email verification on registration
- [x] TOTP-based 2FA with QR setup
- [x] RBAC guards on all protected routes
- [x] Password reset with expiring token
- [x] Rate limiting on login (10/60s), register (5/60s), forgot-password (3/60s)

## API Security
- [x] Global validation pipe (whitelist, forbidNonWhitelisted)
- [x] Helmet security headers (XSS, content-type sniffing, frame options, etc.)
- [x] CORS restricted to configured origin
- [x] Bearer token required for protected routes
- [x] No Proxmox API exposed to frontend
- [x] Idempotency keys prevent double-provisioning

## Data Protection
- [x] Integer minor units for money (no float)
- [x] Audit log for every state-changing action
- [x] Append-only Transaction and AuditLog tables
- [x] Resource pool admission in same DB transaction

## Infrastructure
- [ ] PostgreSQL running with `ssl=require` in production
- [ ] Redis with `requirepass` in production
- [ ] HTTPS termination (reverse proxy: nginx/caddy)
- [ ] Database backup schedule configured (see scripts/backup.sh)
- [ ] Restore drill verified (see scripts/restore.sh)
- [ ] Node.js not running as root
- [ ] Proxmox API token scoped to minimal permissions

## Dependency Audit (as of build)
- 14 vulnerabilities found: 5 moderate, 9 high
- All are in transitive dependencies of NestJS and Next.js
- No fix available without breaking major version upgrades
- PostCSS XSS in Next.js (moderate) — known issue, Next.js 16+ fixes it
- NestJS cross-package version mismatches — safe, dev-only dependencies

## Penetration Testing Notes
- Auth brute force: rate-limited at 10 req/60s on login
- VM creation: admission control prevents overcommit
- 2FA required for sensitive admin actions (configurable)
- JWT secrets are auto-generated on install
- No default credentials shipped
