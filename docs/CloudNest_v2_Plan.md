# CloudNest v2 Expansion Plan

## Audit Summary

### Delivered (this session)
- **ResourcePoolController** — `@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth()` added (critical security gap fixed)
- **API Keys module** (`/api-keys`) — list, create (returns raw key once), delete
- **SSH Keys module** (`/ssh-keys`) — list, add, delete
- **IP Pools module** (`/ip-pools`) — CRUD pools, add/remove IPs (admin-only)

### Existing frontend, now backed
| Frontend Page | Backend | Notes |
|---|---|---|
| `/dashboard/settings/api-keys` | ✅ `ApiKeysModule` | Works |
| `/dashboard/settings/ssh-keys` | ✅ `SshKeysModule` | Works |
| Admin IP pools (TBD) | ✅ `IpPoolModule` | Admin-only |

### Still missing (needs full build)

Below are grouped into phases prioritizing functional value.

---

## Phase A — Admin Dashboard + VPS Ops (HIGH)

### A1 — Admin Dashboard Stats
- Revenue (mtd, total), active customers, node capacity, VM count
- Alerts feed (failed jobs, suspended VMs, low node resources)
- Quick links (recent tickets, pending actions)
- **Effort**: ~1 session (backend + frontend)

### A2 — VM List / Search / Filter (Admin)
- DataTable with columns: Name, IP, Node, Status, Plan, Owner, Created
- Filters: status, node, user, search (name/IP)
- Bulk actions: start/stop/restart/delete selected VMs
- **Effort**: ~1 session

### A3 — VM Detail (Admin)
- Read-only view of VM config, resource usage, recent events
- Firewall rules tab (display only — Proxmox API provides `/api2/json/nodes/{node}/qemu/{vmid}/firewall/rules`)
- Rename VM, assign tags, change notes
- **Effort**: ~1 session

### A4 — Customer Management (Admin)
- User list with search, status filter, wallet balance
- Wallet adjust with reason (logged to AuditLog)
- Suspend/ban user (block login + suspend all VMs)
- Login history (from AuditLog)
- Force password reset
- **Effort**: ~1 session

### A5 — Firewall Rules
- Per-VM firewall: list rules, add/remove/edit (Proxmox API)
- Default-deny / allow patterns
- Frontend: simple table with protocol/port/source/action
- **Effort**: ~1 session (backend Proxmox + frontend)

---

## Phase B — Infrastructure & Templates (MEDIUM)

### B1 — IPAM (most of `IpPoolModule` done)
- ✅ Pool CRUD (`POST/GET/PUT/DELETE /ip-pools`)
- ✅ Add/remove IPs (`POST/DELETE /ip-pools/ips`)
- ☐ PTR (reverse DNS) records per IP
- ☐ Auto-assignment on VM create (integrate with `createVm` flow)
- ☐ Frontend pool list/detail page + IP assignment UI
- **Remaining effort**: ~1 session

### B2 — Template / ISO Management
- List Proxmox templates (`/nodes/{node}/storage/{storage}/content`)
- Upload ISO from URL to Proxmox storage
- Delete template/ISO
- Per-template defaults (disk size, memory, cores)
- **Effort**: ~1 session (Proxmox API already has storage/content)

### B3 — Node Management
- Node list with live stats (CPU/RAM/storage from Proxmox)
- Maintenance mode (toggle — drain VMs, block new deployments)
- Node detail with per-VM breakdown
- **Effort**: ~1 session

### B4 — Audit Log Viewer (Admin)
- Searchable/filterable table of all AuditLog entries
- Filters: action, userId, resource type, date range
- **Effort**: ~0.5 session (data exists, need endpoint + UI)

---

## Phase C — Payments & Billing Config (HIGH)

### C1 — Payment Gateway Integration
- Stripe: Checkout session creation, webhook (charge.succeeded → credit wallet)
- PayPal: Orders API + webhook
- Crypto: Coinbase Commerce or static address
- `Transaction` model exists but needs `gateway`, `gatewayTxId`, `status`
- **Effort**: 2-3 sessions per gateway

### C2 — Billing Configuration (Admin)
- Pricing plans CRUD (price per core, per GB RAM, per GB disk)
- Tax/VAT rate configuration
- Grace period length (configurable, not hardcoded)
- Invoice customization (company info, logo, terms)
- **Effort**: ~1 session

### C3 — PDF Invoice Generation
- Generate PDF from Invoice data (using pdfkit or similar)
- Download link on invoice detail page
- Email invoice on generation
- **Effort**: ~1 session

### C4 — Notification Templates
- Admin UI for email/notification message templates
- Variables: `{{vmName}}`, `{{balance}}`, `{{dueDate}}`, etc.
- **Effort**: ~1 session

---

## Phase D — Monitoring & Reporting (LOW)

### D1 — Resource Usage Charts
- VM-level: CPU/memory/disk (aggregated from Proxmox RRD data or periodic polling)
- Node-level: capacity vs used (bar charts, time series)
- Revenue over time (line chart)
- Customer growth (cumulative)
- **Effort**: 2-3 sessions (data aggregation + chart libraries)

### D2 — Scheduled Reports
- Weekly/monthly: revenue, new customers, resource utilization
- Email to admin
- **Effort**: ~1 session

---

## Phase E — V2 Features (OPTIONAL)

### E1 — Customer Impersonation (Admin)
- "Login as user" button in admin panel
- JWT minted with `impersonatorId` claim
- Audit-logged
- **Effort**: ~0.5 session

### E2 — Two-Factor Authentication (2FA)
- TOTP setup flow (QR code → verify → enable)
- Backup codes
- **Effort**: ~1 session

### E3 — Multi-Node Migration
- Live migrate VM between Proxmox nodes
- Requires shared storage
- **Effort**: 1-2 sessions (Proxmox API + BullMQ job)

---

## Quick Wins (next session, <1 hr each)

1. **Admin VM list page** — backend endpoint `GET /admin/vms` with search/filter/pagination; frontend DataTable reusing existing components
2. **Admin customer detail** — backend `GET /admin/users/:id` with VMs, wallet, invoices
3. **Firewall rules** — backend `GET/POST/DELETE /vms/:id/firewall-rules` proxied to Proxmox; frontend table
4. **Template list** — backend `GET /admin/templates` listing Proxmox storage content; frontend page

## Security & Hardening Backlog

- [ ] Rate-limit login endpoint specifically (stricter than global throttle)
- [ ] Webhook signature verification for payment gateways
- [ ] SQL injection — Prisma protects, but raw queries in billing/reports need review
- [ ] API key scoping (currently all-or-nothing)
