# FeatherPanel Full Codebase Audit

**Repository:** `/home/mesba7/Documents/Github/Cloud Nest/featherpanel`
**Version:** v1.3.7+4 (stable)
**Framework:** PHP 8.5+ custom framework (Symfony Routing + HTTP Foundation), Next.js 16 + React 19 (frontend), Rust tokio (async runner)
**Database:** MariaDB/MySQL with 145+ raw SQL migrations
**License:** AGPL-3.0 (frontend), MIT (backend)

---

## Table of Contents

1. [Auth & User Management](#1-auth--user-management)
2. [Permissions & Roles](#2-permissions--roles)
3. [Game Servers (Wings-based)](#3-game-servers-wings-based)
4. [VDS/VMs (Proxmox-based)](#4-vdsvms-proxmox-based)
5. [Node Management](#5-node-management)
6. [Admin Panel & Dashboard](#6-admin-panel--dashboard)
7. [Support Tickets](#7-support-tickets)
8. [Knowledge Base](#8-knowledge-base)
9. [Notifications](#9-notifications)
10. [Plugins & Extensions](#10-plugins--extensions)
11. [API Keys & OAuth2](#11-api-keys--oauth2)
12. [System Configuration & Settings](#12-system-configuration--settings)
13. [SSH Keys](#13-ssh-keys)
14. [Subusers (Server-level Permissions)](#14-subusers-server-level-permissions)
15. [File Manager](#15-file-manager)
16. [Backups](#16-backups)
17. [Schedules & Tasks](#17-schedules--tasks)
18. [Databases](#18-databases)
19. [Firewall](#19-firewall)
20. [Proxy / Subdomains](#20-proxy--subdomains)
21. [Monitoring & Analytics (KPI)](#21-monitoring--analytics-kpi)
22. [Email / Mail System](#22-email--mail-system)
23. [i18n / Translations](#23-i18n--translations)
24. [Chatbot / AI](#24-chatbot--ai)
25. [Runner (Rust Async Processor)](#25-runner-rust-async-processor)
26. [Billing, Plans, Subscriptions](#26-billing-plans-subscriptions)
27. [Feature Inventory Table](#27-feature-inventory-table)

---

## 1. Auth & User Management

### Backend Endpoints

#### 1a. Login — `LoginController.php`
- **File:** `backend/app/Controllers/User/Auth/LoginController.php`
- **Methods:**
  - `login()` — `PUT /api/user/auth/login` — Authenticates via email/username + password. Supports Discord tokens and SSO tokens as alternatives. Validates Turnstile CAPTCHA if configured. Sets `remember_token` cookie on success. Has two-factor middleware callback.
  - `session()` — `GET /api/user/auth/session` — Returns current session user data with permissions.
  - `passkey()` — Passkey presence check endpoint.
- **Inputs:** `{ email, password, remember? }` or Discord/SSO tokens. Auth: none (public).
- **Outputs:** JWT-like session, `remember_token` cookie, user data with permissions.
- **Dependencies:** `User::getUserByEmail()`, `User::getUserByUsername()`, `CaptchaHelper`, two-factor check via `TwoFactorController`.
- **Error handling:** Returns `ApiResponse::error()` for invalid credentials, banned accounts, or CAPTCHA failures. Handles "too many login attempts" via rate limiting.
- **Business rules:**
  - Email or username accepted interchangeably.
  - Remember token persisted in DB and cookie for session persistence.
  - Login can be disabled via setting `user_allow_login`.

#### 1b. Registration — `RegisterController.php`
- **File:** `backend/app/Controllers/User/Auth/RegisterController.php`
- **Method:** `register()` — `PUT /api/user/auth/register`
- **Inputs:** `{ username, email, password, first_name, last_name, turnstile_token }`
- **Outputs:** Creates user, sends verification email, returns success.
- **Dependencies:** `User::createUser()`, `EmailDomainValidator`, `CaptchaHelper`.
- **Business rules:**
  - Email domain can be blocked via `featherpanel_blocked_email_domains` setting.
  - Registration can be disabled via setting.
  - Turnstile CAPTCHA is mandatory (provider-configurable).
  - First registered user gets admin role.

#### 1c. Logout — `AuthLogoutController.php`
- **File:** `backend/app/Controllers/User/Auth/AuthLogoutController.php`
- **Method:** `logout()` — `GET` or `DELETE /api/user/auth/logout`
- **Side effects:** Clears `remember_token` in DB, deletes session, clears `_fp_remember` cookie.

#### 1d. Password Reset — `ForgotPasswordController.php` + `ResetPasswordController.php`
- **Forgot:** `PUT /api/user/auth/forgot-password` — Validates email, generates reset token, sends email.
- **Reset:** `PUT/POST /api/user/auth/reset-password` — Validates token, enforces min 8-char password, updates password hash.
- **Dependencies:** `MailHelper` for email sending, `User::getUserByEmail()`.

#### 1e. Two-Factor Auth — `TwoFactorController.php`
- **Methods:**
  - `index()` — `GET` — Returns QR code + secret via `PragmaRX\Google2FA`.
  - `update()` — `PUT` — Enables 2FA with code + secret + Turnstile validation.
  - `destroy()` — `DELETE` — Disables 2FA (needs current password).
  - `verify()` — `POST /api/user/auth/two-factor` or `verify-2fa` — Verifies code during login.
- **Business rules:** 2FA requires Turnstile to enable. Disable requires password confirmation.

#### 1f. Email Verification — `VerifyEmailController.php`
- `verify()` — `GET /api/user/auth/verify-email?token=...`
- `resend()` — `POST /api/user/auth/verify-email/resend`

#### 1g. Email Login (Passwordless) — `EmailLoginController.php`
- `sendCode()` — `PUT /api/user/auth/email-login/send`
- `verifyCode()` — `PUT /api/user/auth/email-login/verify`
- Sends one-time code via email, verifies and logs in.

#### 1h. WebAuthn Passkeys — `PasskeyController.php`
- Full CRUD: register (options + verify), authenticate (options + verify), list, delete, update label, status check.
- Uses `web-auth/webauthn-lib` library.
- Supports conditional UI (autofill="webauthn") on login page.

#### 1i. Discord OAuth — `DiscordController.php`
- Discord OAuth login, register, and account linking flows.

#### 1j. OIDC — `OidcController.php`
- OpenID Connect login via external providers, link/unlink accounts.

#### 1k. LDAP — `LdapController.php`
- LDAP authentication, provider listing, link/unlink accounts.

#### 1l. Admin User Management — `UsersController.php`
- **File:** `backend/app/Controllers/Admin/UsersController.php`
- **Endpoints:**
  - `GET /api/admin/users` — Paginated list with search, filter, sort (by role, banned, email verified, IP, registration date).
  - `PUT /api/admin/users` — Create user (with role assignment).
  - `GET /api/admin/users/{uuid}` — View user details.
  - `PATCH /api/admin/users/{uuid}` — Update fields, ban/unban (with moderation reason), disable 2FA, unlink Discord.
  - `DELETE /api/admin/users/{uuid}` — Delete user.
  - `POST /api/admin/users/{uuid}/sso-tokens` — Generate SSO login link.
  - `GET /api/admin/users/{uuid}/servers` — List user's servers.
  - `GET /api/admin/users/{uuid}/vm-instances` — List user's VMs.
  - `GET /api/admin/users/{uuid}/potential-alts` — Alt account detection via IP/device matching.
  - `DELETE /api/admin/users/{uuid}/devices` — Clear all user devices.
  - `POST /api/admin/users/{uuid}/verify-email` — Force email verification.
  - `GET /api/admin/users/{uuid}/mails` — List user emails.
  - `POST /api/admin/users/{uuid}/mails/resend` — Resend email.
  - `POST /api/admin/users/{uuid}/send-email` — Send direct email to user.

### Auth Middleware

#### AuthMiddleware (cookie + Bearer)
- **File:** `backend/app/Middleware/AuthMiddleware.php`
- Dual-mode authentication: checks `remember_token` cookie first, then falls back to Bearer API token.
- Sets `request->attributes->user` and `request->attributes->user_data`.
- Tracks user devices via `_fp_ui_sid` cookie and `X-FP-UI-Meta` header (fingerprint: timezone, language, screen, color depth, device memory, hardware concurrency).
- Notifies user of foreign IP logins.

#### AdminMiddleware
- **File:** `backend/app/Middleware/AdminMiddleware.php`
- Checks admin permission via `PermissionHelper::hasPermission()`.

#### ServerMiddleware
- Resolves server UUID, checks ownership/subuser status, suspension check, admin bypass.

#### VmInstanceMiddleware
- Resolves VM instance ID, checks ownership via `VmGateway`, suspension check.

### Frontend Auth Pages

#### Login Page
- **File:** `frontendv2/src/app/(app)/auth/login/LoginForm.tsx` + `page.tsx`
- Multi-method login: password, SSO (auto-submit if token in URL), passkey (conditional UI with `autofill="webauthn"`), email-login code toggle, Discord.
- States: loading spinner, error messages, Turnstile CAPTCHA.
- Uses `SessionContext` post-login redirect.

#### Register Page
- **File:** `frontendv2/src/app/(app)/auth/register/RegisterForm.tsx` + `page.tsx`
- Fields: username, email, password, first/last name, Turnstile CAPTCHA.
- Client-side validation: required fields, email format, password length.

#### 2FA Setup Page
- **File:** `frontendv2/src/app/(app)/auth/setup-2fa/SetupTwoFactorForm.tsx`
- QR code display, secret copy button, 6-digit confirmation input, Turnstile.
- Auto-redirects on error or already-enabled state.

#### 2FA Verify Page
- **File:** `frontendv2/src/app/(app)/auth/verify-2fa/VerifyTwoFactorForm.tsx`
- 6-digit code input, numeric-only filtering, email from URL param.

#### Account Settings (Frontend)
- **File:** `frontendv2/src/components/account/ProfileTab.tsx`
  - Edit username, email, first/last name, password, avatar upload, ticket signature.
  - Settings-gated field changes (`user_allow_*_change` setting).
  - Turnstile CAPTCHA on save.
- **File:** `frontendv2/src/components/account/SettingsTab.tsx` (1104 lines)
  - Central settings hub: timezone (browser auto-detect or explicit), 2FA enable/disable, passkey management (add/rename/remove with WebAuthn), Discord/OIDC/LDAP link/unlink (all providers fetched dynamically), data request via ticket system, session logout.
- **File:** `frontendv2/src/components/account/SshKeysTab.tsx`
  - SSH key list, add, edit, view, soft delete, hard delete, restore. Search, fingerprint display, confirmation dialogs.
- **File:** `frontendv2/src/components/account/ApiKeysTab.tsx` (610 lines)
  - API client create (with name + IP restrictions + foreign IP notification), edit, view keys (public + private), regenerate, delete. OAuth2 consent button. Permission-gated by `user_allow_api_keys_create` or `admin.api.bypass_restrictions`.
- **File:** `frontendv2/src/components/account/MailTab.tsx`
  - Email history: paginated list with search, status badges (pending/sent/failed), inline iframe preview, resend for failed mails.
- **File:** `frontendv2/src/components/account/ActivityTab.tsx`
  - Activity log with search, pagination, relative timestamps. Uses `ActivityFeed` component.

#### Admin Users Page (Frontend)
- **File:** `frontendv2/src/app/(app)/admin/users/page.tsx`
  - User list with ResourceCard component. Search, role/banned/email-verified/IP filters, sort controls, pagination.
  - Badges: role, banned, 2FA, email unverified, Discord linked, LDAP/OIDC/local. Actions: force verify email, delete user, clear all devices.
  - Persisted filters via `usePersistedListFilters`, URL-synced search params.
- **File:** `frontendv2/src/app/(app)/admin/users/create/page.tsx`
  - Create user form: username, first/last name, email, password, role selection (fetches available roles from API).
- **File:** `frontendv2/src/app/(app)/admin/users/[uuid]/edit/page.tsx` (1636 lines)
  - Comprehensive user editor with tabs: Servers, Activities, Potential Alts, VDS, Mails.
  - Sidebar: avatar, badges, UUID, timestamps, IPs, linked accounts.
  - Actions: ban/unban (with moderation reason dialog), disable 2FA, unlink Discord, generate SSO link, send direct email.
  - Edit form: username, name, email, role, external_id, password (optional).

### Session & Context (Frontend)

- **SessionContext:** Session state (user, permissions, loading, isSessionChecked), `fetchSession()`, `logout()`, `hasPermission()`, root admin detection.
- **PreferencesContext:** User preferences (timezone, date format), persistence, browser detection fallback.

### Auth Feature Summary

- Email/password login with "remember me" cookie persistence
- Passwordless email login (one-time code)
- WebAuthn passkeys (FIDO2) with conditional UI
- TOTP two-factor authentication via Google Authenticator
- Discord OAuth login, registration, and account linking
- Generic OpenID Connect (multiple providers)
- LDAP authentication (multiple providers, SSL/TLS, group membership)
- Turnstile/hCaptcha/reCAPTCHA on registration, login, 2FA setup, profile changes
- Email verification flow (token-based)
- Password reset flow (token via email)
- Rate limiting on auth endpoints
- Device fingerprint tracking and foreign IP notification
- Ban/unban with moderation reason enforcement
- Alt-account detection via IP/device matching
- Admin impersonation via SSO tokens

---

## 2. Permissions & Roles

### Backend

#### Permission Nodes
- **File:** `backend/app/Permissions.php` — Auto-generated PHP class with 80+ permission node constants (e.g., `admin.root`, `admin.users.*`, `admin.servers.*`, `server.power`, `server.backup.*`, `vm.*`).
- **File:** `backend/app/SubuserPermissions.php` — Server-level subuser permission constants (e.g., `BACKUP_READ`, `BACKUP_CREATE`, `CONSOLE`, `FILE_READ`, `ALLOCATION_UPDATE`, `DATABASE_CREATE`, `SCHEDULE_CREATE`, `USER_CREATE`).
- **File:** `permission_nodes.fpperm` — Source definition file from which the PHP constants are generated.

#### Permission Checking
- **File:** `backend/app/Helpers/PermissionHelper.php` — `hasPermission(userUuid, permission)`: queries role-permission join table. Special-cases `admin.root` as wildcard (grants all). Returns boolean.
- **File:** `frontendv2/src/lib/permissions.ts` — Client-side mirror with `ADMIN_*` constants and `getAll()` metadata method.

#### Role Management
- **File:** `backend/app/Controllers/Admin/RolesController.php` — CRUD for roles (name, display_name, color, custom_badge). Assign/remove permissions.
- **Routes:**
  - `GET /api/admin/roles` — List roles with permission counts.
  - `POST /api/admin/roles` — Create role.
  - `PUT /api/admin/roles/{id}` — Update role.
  - `DELETE /api/admin/roles/{id}` — Delete role.
  - `POST /api/admin/roles/{id}/permissions` — Assign permission to role.
  - `DELETE /api/admin/roles/{id}/permissions/{permission}` — Remove permission from role.

#### DB Schema
- `featherpanel_roles` — id, name, display_name, color, custom_badge
- `featherpanel_permissions` — id, role_id (FK CASCADE), permission (VARCHAR)
- `featherpanel_server_subusers.permissions` — JSON column storing per-subuser permission set

### Permissions Feature Summary

- Hierarchical permission node system (80+ nodes) with `admin.root` wildcard
- Dual backend (PHP) and frontend (TypeScript) permission constants, auto-generated
- Admin roles with display names, colors, and custom badges
- Server-level subuser permissions stored as JSON
- PermissionGuard component for gated UI elements
- Admin role assignment per user

---

## 3. Game Servers (Wings-based)

This is the primary domain of FeatherPanel — game server management via Docker containers through the Wings daemon agent.

### Backend Controllers

#### ServerUserController (2597 lines)
- **File:** `backend/app/Controllers/User/Server/ServerUserController.php`
- **Endpoints:**

| Method | Route | Purpose |
|--------|-------|---------|
| `getUserServers()` | `GET /api/user/servers` | List user's servers (owned + subuser) with pagination/search/status filter. Admins can use `view_all=true`. |
| `getAdminAllOtherServers()` | `GET /api/user/servers/all-others` | List servers NOT owned by current user (admin-only). |
| `getServer()` | `GET /api/user/servers/{uuidShort}` | Full server detail: node, realm, spell, allocation, location, SFTP info, subdomain, variables, subuser permissions. |
| `generateServerJwt()` | `POST /api/user/servers/{uuidShort}/jwt` | Generate 10-min JWT for Wings WebSocket API access. |
| `updateServer()` | `PUT /api/user/servers/{uuidShort}` | Update name, description, startup, image, spell_id, variables, backup_retention_mode. Syncs with Wings. |
| `createCustomVariable()` | `POST /api/user/servers/{uuidShort}/custom-variables` | Create custom env variable. |
| `deleteCustomVariable()` | `DELETE /api/user/servers/{uuidShort}/custom-variables/{variableId}` | Delete custom variable. |
| `reinstallServer()` | `POST /api/user/servers/{uuidShort}/reinstall` | Reinstall server via Wings, optionally wiping files. |
| `sendCommand()` | `POST /api/user/servers/{uuidShort}/command` | Send console command to server via Wings. |
| `deleteServer()` | `DELETE /api/user/servers/{uuidShort}` | Delete server — cleans up subdomains, allocations, databases, then deletes from Wings. Owner-only. |

- **Auth:** Authenticated user + subuser permission checks via `CheckSubuserPermissionsTrait`. Admin permissions for cross-user operations.
- **Key business rules:**
  - Server deletion gated by `SERVER_ALLOW_USER_SERVER_DELETION` setting.
  - Egg/spell changes can be globally disabled.
  - Cross-realm spell changes can be disabled.
  - Custom Docker images / startup changes can be restricted.
  - Rate limits: delete 1/hr, update 2/min, command 30/min.
- **Side effects:** Creates AuditLog via `ServerActivity::createActivity()`, emits plugin events, syncs to Wings daemon.

#### ServerBackupController (1167 lines)
- **File:** `backend/app/Controllers/User/Server/ServerBackupController.php`
- **Endpoints:** Full CRUD + lock/unlock + restore + download URL generation.
- **Business rules:**
  - FIFO eviction: oldest backup auto-deleted if at limit and fifo_rolling enabled.
  - Locked backups cannot be deleted or restored.
  - Backup must be successful for download.
  - Rollback DB record if Wings call fails.
- **Auth:** Subuser permissions per operation: `BACKUP_READ`, `BACKUP_CREATE`, `BACKUP_RESTORE`, `BACKUP_DELETE`, `BACKUP_DOWNLOAD`.

#### ServerAllocationController (821 lines)
- **File:** `backend/app/Controllers/User/Server/ServerAllocationController.php`
- **Endpoints:** CRUD for allocations, set primary, auto-allocate, list available.
- **Business rules:**
  - Allocation limit per server.
  - Cannot delete primary allocation.
  - Must be on same node as server.
  - Syncs to Wings after changes.

#### ServerDatabaseController (1955 lines)
- **File:** `backend/app/Controllers/User/Server/ServerDatabaseController.php`
- **Endpoints:** CRUD, rotate password, list hosts, test connection.
- **Business rules:**
  - Database limit per server.
  - Host must be global or tied to server's node.
  - Only mysql/mariadb/postgresql supported.
  - Name format: `s{server_id}_{name}`, username format: `u{server_id}_{random10}`.
  - Rollback on failure.

#### ServerScheduleController (1328 lines)
- **File:** `backend/app/Controllers/User/Server/ServerScheduleController.php`
- **Endpoints:** CRUD + toggle for cron schedules with tasks.

#### ServerFirewallController
- **File:** `backend/app/Controllers/User/Server/ServerFirewallController.php`
- CRUD for allow/deny firewall rules (IP, port, protocol). Syncs to Wings.

#### ServerProxyController
- **File:** `backend/app/Controllers/User/Server/ServerProxyController.php`
- Manages Nginx proxy configuration. Creates/deletes proxy configs, syncs to Wings.

#### ServerFastDlController
- **File:** `backend/app/Controllers/User/Server/ServerFastDlController.php`
- FastDL (direct download) for server files. Generates download links for asset distribution.

#### ServerLifecycleHookController
- **File:** `backend/app/Controllers/User/Server/ServerLifecycleHookController.php`
- Lifecycle hooks: scripts run on server events (start, stop, install, etc.). CRUD.

#### ServerImportController
- **File:** `backend/app/Controllers/User/Server/ServerImportController.php`
- Server import from Pterodactyl. Data mapping and validation.

#### SubdomainController
- **File:** `backend/app/Controllers/User/Server/SubdomainController.php`
- Server subdomain assignments. Create/delete/list.

#### SubuserController
- **File:** `backend/app/Controllers/User/Server/SubuserController.php`
- Server subuser CRUD with permission management.

#### TaskController
- **File:** `backend/app/Controllers/User/Server/TaskController.php`
- Schedule task management: reorder tasks, update payloads (commands to run on cron).

#### PlayerStatusController
- **File:** `backend/app/Controllers/User/Server/PlayerStatusController.php`
- Query game server player status (online player count, etc.).

#### ServerActivityController
- **File:** `backend/app/Controllers/User/Server/ServerActivityController.php`
- Lists server activity/logs with pagination.

#### Wings Controllers (Daemon Agent API)
- **File:** `backend/app/Controllers/Wings/WingsServerListController.php` — `GET /api/remote/servers` — List all servers Wings should manage.
- **File:** `backend/app/Controllers/Wings/WingsServerInfoController.php` — `GET/POST /api/remote/servers/{uuid}/install` — Server install script and completion reporting.
- **File:** `backend/app/Controllers/Wings/WingsServerStatusController.php` — `POST /api/remote/servers/{uuid}/container/status` — Container status updates from Wings.
- **File:** `backend/app/Controllers/Wings/WingsBackupController.php` — Backup upload, completion, and restore reporting.
- **File:** `backend/app/Controllers/Wings/WingsActivityController.php` — `POST /api/remote/activity` — Log activity from Wings.
- **File:** `backend/app/Controllers/Wings/SftpAuthController.php` — `POST /api/remote/sftp/auth` — Authenticate SFTP user.
- **File:** `backend/app/Controllers/Wings/WingsTransferStatusController.php` — Server transfer status reporting.
- **File:** `backend/app/Controllers/Wings/WingsConfigController.php` — `GET /api/remote/config` — Wings daemon configuration.
- **Auth:** Shared token (node `daemon_token_id` + `daemon_token`).

#### Admin Server Controller
- **File:** `backend/app/Controllers/Admin/ServersController.php` (1097 lines, ~155KB file)
- Full CRUD for servers from admin panel. Bulk operations, search, suspend/unsuspend, transfer between nodes, email notifications, allocation/subuser/database management.

### Wings (Daemon Agent) Architecture
- Panel communicates with Wings via REST API (HTTP) + WebSocket for real-time console.
- Panel generates YAML config files for Wings daemon.
- Wings manages Docker containers based on spell/egg definitions (Docker images, startup commands, environment variables).
- SFTP authentication proxied through panel to Wings.
- Backup upload/download via JWT-signed URLs with 5-min expiry.

### Frontend Server Pages

#### Server Layout & Navigation
- **File:** `frontendv2/src/app/(app)/server/[uuidShort]/layout.tsx`
  - Sidebar navigation with tabs: Console, Settings, Startup, Files, Databases, Backups, Schedules, Allocations, Subdomains, Users, Activities, Firewall, Proxy, FastDL, Lifecycle Hooks, Import.
  - Plugin hook points for additional tabs.
  - Suspended server overlay (shows suspension message, blocks actions).

#### Console Page
- **File:** `frontendv2/src/app/(app)/server/[uuidShort]/console/page.tsx` + `frontendv2/src/components/server/ServerTerminal.tsx` (53KB)
  - WebSocket-based terminal emulator via Xterm.js.
  - Server performance graphs (CPU, memory, disk).
  - Power controls (start, stop, restart, kill).
  - Player status widget for game servers.

#### Settings Page
- Server name, description, reinstall (with file wipe option), delete with confirmation.

#### Startup Page
- Startup command editing, Docker image selection, environment variable management.

#### Files Page
- Full file manager: list, read, write, upload, download, compress, decompress, rename, delete.
- **Notable:** Uses WebSocket for real-time file operations.

#### Databases Page
- Database management: create, update, delete, rotate password, view credentials.

#### Backups Page
- Backup management: create, restore, lock/unlock, download, delete. FIFO eviction display.

#### Schedules Page
- Cron schedule management with task reordering.

#### Allocations Page
- IP/port allocation management, set primary, auto-allocate.

#### Users Page (Subusers)
- Server subuser management with permission checkboxes.

#### Firewall Page
- Firewall rule management (allow/deny, IP, port, protocol).

#### Proxy Page
- Nginx proxy configuration management.

#### Server Dashboard
- **File:** `frontendv2/src/app/(app)/dashboard/servers/page.tsx`
  - Server listing with grid/list toggle, search, sort, running filter, view mode (all/folders).
  - Bulk power actions, WebSocket live stats per card.
  - Preferences persisted to localStorage.

#### Key Frontend Components
- **ServerCard** (`components/servers/ServerCard.tsx`, 23KB): Grid/list card with status badge, resource bar, power buttons, player count.
- **ResourceBar** (`components/servers/ResourceBar.tsx`): Resource usage bar (CPU/RAM/disk).
- **StatusBadge** (`components/servers/StatusBadge.tsx`): Color-coded status indicator.
- **ServerTerminal** (`components/server/ServerTerminal.tsx`, 53KB): Full WebSocket terminal with Xterm.js.
- **ServerSwitcher** (`components/server/ServerSwitcher.tsx`, 22KB): Server navigation dropdown.
- **ServerPerformance** (`components/server/ServerPerformance.tsx`): Graph-based performance display.

### Server Feature Summary

- Full server lifecycle: create, start, stop, restart, kill, reinstall, delete
- Console with WebSocket terminal (Xterm.js) and command presets
- Real-time server performance graphs (CPU, RAM, disk)
- Docker image management per server type (spell/egg)
- Environment variable management (custom + spell-defined)
- File manager with WebSocket operations (CRUD, upload, download, compress)
- Database hosting (MySQL/MariaDB/PostgreSQL) on external hosts
- Backup management with FIFO eviction policy, lock/unlock
- Scheduled tasks via cron with reorderable task chains
- IP/port allocation management with auto-allocate
- Nginx reverse proxy configuration
- Firewall rules (allow/deny by IP, port, protocol)
- FastDL (direct download) for game assets
- Lifecycle hooks (scripts run on server events)
- Subuser system with granular permissions
- Subdomain assignment
- Player status monitoring for game servers
- Server import from Pterodactyl
- Activity log with pagination
- Wings daemon communication via REST + WebSocket with JWT auth
- SFTP support per server with auth proxied through panel
- Files-first backup upload/download architecture

---

## 4. VDS/VMs (Proxmox-based)

This domain handles Virtual Dedicated Servers (KVM/QEMU and LXC containers) managed through Proxmox VE hypervisors.

### Backend Controllers

#### VmUserInstanceController (2174 lines)
- **File:** `backend/app/Controllers/User/Vds/VmUserInstanceController.php`
- **Endpoints:**

| Method | Route | Purpose |
|--------|-------|---------|
| `getUserVmInstances()` | `GET /api/user/vm-instances` | List user's VMs (owned + subuser), deduplicated, paginated/searchable. |
| `getVmInstance()` | `GET /api/user/vm-instances/{id}` | VM details including access password, IPs, permissions. |
| `getVmInstanceStatus()` | `GET /api/user/vm-instances/{id}/status` | Live status from Proxmox (via PHP Proxmox client, synchronous). |
| `getQemuHardware()` | `GET /api/user/vm-instances/{id}/qemu-hardware` | BIOS, EFI, TPM, serial0 config from Proxmox. |
| `patchQemuHardware()` | `PATCH /api/user/vm-instances/{id}/qemu-hardware` | Update BIOS (seabios/ovmf), EFI, TPM, serial0. |
| `getNetworkOptions()` | `GET /api/user/vm-instances/{id}/network-options` | Available IPs and DNS settings. |
| `getNetworking()` | `GET /api/user/vm-instances/{id}/networking` | Current network interface config. |
| `patchNetworkDns()` | `PATCH /api/user/vm-instances/{id}/network-dns` | Update DNS (nameservers, search domain). |
| `getIsoStorages()` | `GET /api/user/vm-instances/{id}/iso-storages` | ISO-capable storage on Proxmox node. |
| `getIsoCurrent()` | `GET /api/user/vm-instances/{id}/iso-current` | Currently mounted ISO. |
| `uploadAndMountIso()` | `POST /api/user/vm-instances/{id}/iso-upload-and-mount` | Upload ISO from URL and mount. |
| `fetchAndMountIsoFromUrl()` | `POST /api/user/vm-instances/{id}/iso-fetch-and-mount` | Fetch ISO from URL and mount. |
| `unmountIso()` | `POST /api/user/vm-instances/{id}/iso-unmount` | Unmount current ISO. |
| `getTemplates()` | `GET /api/user/vm-instances/{id}/templates` | Available OS templates for reinstall. |
| `powerAction()` | `POST /api/user/vm-instances/{id}/power` | Start/stop/restart/kill VM via Proxmox. |
| `getVncTicket()` | `GET /api/user/vm-instances/{id}/vnc-ticket` | VNC ticket for console (creates short-lived Proxmox user). |
| `reinstall()` | `POST /api/user/vm-instances/{id}/reinstall` | Reinstall from template (async via Runner). |
| `reinstallStatus()` | `GET /api/user/vm-instances/reinstall-status/{reinstallId}` | Poll reinstall task status. |
| `taskStatus()` | `GET /api/user/vm-instances/task-status/{taskId}` | Poll any VM task status. |

- **Auth:** Owner, subuser (with matching permissions), or admin via `ADMIN_VM_INSTANCES_*` permissions. Checks via `VmGateway::hasVmPermission()`.
- **Key Architecture:** Quick ops (status, power, VNC, config reads) are synchronous via PHP Proxmox client. Long ops (create, reinstall, backup, restore) are async via Redis queue → Rust Runner.

#### VmUserBackupController (639 lines)
- **File:** `backend/app/Controllers/User/Vds/VmUserBackupController.php`
- **Endpoints:**
  - `listBackups()` — List backups + backup limit + available Proxmox storages + retention metadata.
  - `createBackup()` — Start async vzdump backup via Runner. Returns 202 with backup_id.
  - `backupStatus()` — Poll backup task status.
  - `deleteBackup()` — Delete backup (Proxmox + DB record).
  - `restoreBackup()` — Restore VM from backup (async, via Runner).
  - `restoreBackupStatus()` — Poll restore status.
- **Business rules:** Backup limit enforced per instance. FIFO eviction supported. Node-level backup storage preferred.

#### VmUserSubuserController
- **File:** `backend/app/Controllers/User/Vds/VmUserSubuserController.php`
- VM subuser management (CRUD + permissions).

#### VmUserActivityController
- **File:** `backend/app/Controllers/User/Vds/VmUserActivityController.php`
- VM activity log listing.

#### Admin VM Controller
- **File:** `backend/app/Controllers/Admin/VmInstancesController.php` (135KB)
- Full CRUD, provisioning, suspend/unsuspend, power actions, backups, reinstall, task management.

#### Admin VM Nodes Controller
- **File:** `backend/app/Controllers/Admin/VmNodesController.php`
- Proxmox node management: CRUD, credentials, storage config, IP pool management, template management, test connection.

### Proxmox Client (PHP)
- **File:** `backend/app/Services/Proxmox/Proxmox.php` (52KB)
- Full Proxmox VE API client. Methods: `getVersion()`, `getNodes()`, `getNodeStatus()`, `getQemuList()`, `getLxcList()`, `getVmStatus()`, `getVmConfig()`, `getVmStatusCurrent()`, `startVm()`, `stopVm()`, `restartVm()`, `shutdownVm()`, `createVzdump()`, `getVzdumpStatus()`, `deleteBackup()`, `restoreBackup()`, `getBackupStorages()`, `getStorageContent()`, `createQemu()`, `createLxc()`, `cloneQemu()`, `cloneLxc()`, `deleteVm()`, `resizeDisk()`, `setVmConfig()`, `createVncTicket()`, `findNodeByVmid()`, `getTaskStatus()`, `createUser()`, `deleteUser()`.
- Auth: PVEAPIToken (token ID + secret).
- Supports TLS verification toggle, custom headers/params.

#### VmInstanceUtil Service
- **File:** `backend/app/Services/Vm/VmInstanceUtil.php` (58KB, 1340 lines)
- `buildProxmoxClientForNode()` — Factory for Proxmox client from node config.
- VM provisioning, template operations.
- Backup management helpers.
- VNC console user management (creates short-lived `fp-console-*` Proxmox users).
- IP assignment logic from pool.

### Frontend VDS Pages

#### VM Layout & Navigation
- **File:** `frontendv2/src/app/(app)/vds/[id]/layout.tsx`
  - Sidebar: Console, Network, Backups, Settings, Users, Activities.
  - Suspended VM overlay.

#### Console Page
- **File:** `frontendv2/src/app/(app)/vds/[id]/VdsConsolePage.tsx`
  - VNC console (noVNC/xterm).
  - Performance metrics (CPU, RAM, disk graphs via recharts).
  - Power controls (start, stop, restart, kill).
  - IP info display.
  - ISO management (mount/unmount).

#### Network Page
- **File:** `frontendv2/src/app/(app)/vds/[id]/network/page.tsx`
  - IP configuration, DNS settings, network interfaces.

#### Backups Page
- Backup list, create, restore, delete. Proxmox storage selection.

#### Settings Page
- VM hardware config (CPU, RAM, disk via QEMU hardware patching).
- Reinstall from template, delete.

#### VM Dashboard
- **File:** `frontendv2/src/app/(app)/dashboard/vms/page.tsx`
  - VM listing: grid/list toggle, search, sort, running filter.
  - VmCard component with status, specs, IP info.

### VDS/VM Feature Summary

- Full VM lifecycle: create (from template), start, stop, restart, kill, reinstall, delete
- VNC console with noVNC (creates short-lived Proxmox users for auth)
- Real-time performance graphs (CPU, RAM, disk)
- QEMU hardware configuration (BIOS, EFI, TPM, serial0)
- Network configuration (IPs, DNS, interfaces)
- ISO management (upload from URL, fetch from URL, mount, unmount)
- Backup management (vzdump) with async processing via Rust Runner
- OS template management for reinstall
- Proxmox node management with encrypted credentials
- IP pool management with CIDR/gateway
- Subuser system with VM-level permissions
- Activity log
- **Architecture difference from CloudNest:** FeatherPanel splits VM operations between synchronous PHP (quick ops) and async Rust (long ops). CloudNest uses BullMQ for all proxmox-mutating operations.

---

## 5. Node Management

### Backend

#### Wings Node Management
- **File:** `backend/app/Controllers/Admin/NodesController.php`
- **Endpoints:**
  - `GET /api/admin/nodes` — List nodes with location, server count, allocation count.
  - `POST /api/admin/nodes` — Create node.
  - `GET /api/admin/nodes/{id}` — Get node details.
  - `PUT /api/admin/nodes/{id}` — Update node.
  - `DELETE /api/admin/nodes/{id}` — Delete node.
  - `POST /api/admin/nodes/{id}/allocations/sync` — Sync allocations via Wings.

#### Proxmox VM Node Management
- **File:** `backend/app/Controllers/Admin/VmNodesController.php` (232 lines)
- **Endpoints:**
  - `GET /api/admin/vm-nodes` — List Proxmox nodes.
  - `POST /api/admin/vm-nodes` — Create VM node (with Proxmox credentials).
  - `GET /api/admin/vm-nodes/{id}` — Get node details.
  - `PUT /api/admin/vm-nodes/{id}` — Update node.
  - `DELETE /api/admin/vm-nodes/{id}` — Delete node.
  - `GET /api/admin/vm-nodes/{id}/test` — Test Proxmox connection.
  - `POST /api/admin/vm-nodes/{id}/storage` — Add storage config.
  - `GET /api/admin/vm-nodes/{id}/storage` — List storage configs.
  - `DELETE /api/admin/vm-nodes/{id}/storage/{storageId}` — Delete storage config.
  - `POST /api/admin/vm-nodes/{id}/ips` — Add IP pool.
  - `GET /api/admin/vm-nodes/{id}/ips` — List IP pools.
  - `DELETE /api/admin/vm-nodes/{id}/ips/{ipId}` — Delete IP.
  - `POST /api/admin/vm-nodes/{id}/templates` — Add OS template.
  - `GET /api/admin/vm-nodes/{id}/templates` — List OS templates.
  - `DELETE /api/admin/vm-nodes/{id}/templates/{templateId}` — Delete template.
  - `GET /api/admin/vm-nodes/{id}/usage` — Resource usage stats.

#### Node Entity Models
- **File:** `backend/app/Chat/Node.php` (880 lines) — Wings/game node entity. CRUD with field whitelist, daemon token encryption/decryption, Wings auth validation, YAML config generation.
- **File:** `backend/app/Chat/VmNode.php` (494 lines) — Proxmox node entity. CRUD, location type validation (must be 'vps'), token encryption/decryption, TLS config.
- **File:** `backend/app/Chat/Location.php` (164 lines) — Location entity. Simple CRUD with type filtering (game/vps/web).

#### Key DB Schema for Nodes
- `featherpanel_nodes` — Game/Wings nodes: id, uuid, name, fqdn, scheme, behind_proxy, maintenance_mode, memory/disk/upload_size (resource limits), memory_overallocate/disk_overallocate (percentages), daemon_token_id, daemon_token (encrypted), daemonListen/SFTP/Base ports, location_id (FK to locations).
- `featherpanel_vm_nodes` — Proxmox nodes: id, name, fqdn, scheme, port, user, token_id, secret (encrypted), tls_no_verify, timeout, location_id (FK to locations), additional_headers, additional_params, storage_tpm, storage_efi, storage_backups.
- `featherpanel_locations` — id, name, description, type (game/vps/web). Referenced by both node types.

#### Admin Wings Node Page (Frontend)
- **File:** `frontendv2/src/app/(app)/admin/nodes/page.tsx`
  - Node list with search, status, location, allocation counts.
  - Create/edit/delete nodes.
  - Maintenance mode toggle.

#### Admin VM Nodes Page
- **File:** `frontendv2/src/app/(app)/admin/vm-nodes/page.tsx`
  - Proxmox node list with connection status, resource usage.
  - Per-node: IP pool management, storage config, template management.

### Node Feature Summary

- Two distinct node types: Wings (game servers) and Proxmox (VMs)
- Node locations (shared between both types, filterable by type)
- Resource limits with overallocate percentages for Wings nodes
- Encrypted daemon/API credentials
- Maintenance mode toggle per node
- YAML config generation for Wings daemon
- Test connection endpoint for Proxmox nodes
- Per-node IP pools and storage configuration for Proxmox
- Template management per Proxmox node

---

## 6. Admin Panel & Dashboard

### Backend

#### DashboardController
- **File:** `backend/app/Controllers/Admin/DashboardController.php` (243 lines)
- **Endpoints:**
  - `GET /api/admin/dashboard` — Aggregate stats: users, nodes, spells, servers, cron tasks, VDS instances. Returns counts for each.

#### Analytics/KPI Controllers
- **File:** `backend/app/Controllers/Admin/KpiController.php` — Routes for 6 KPI endpoint groups (VdsAnalytics, ServerAnalytics, UserAnalytics, InfrastructureAnalytics, ContentAnalytics, SystemAnalytics).
- Each KPI endpoint returns domain-specific counts and statistics.

#### All Admin Controllers (51 files)
- Full list of admin controllers:
  - UsersController, ServersController, VmInstancesController, VmNodesController
  - NodesController, AllocationsController, ImagesController, SpellsController
  - RolesController, PermissionsController, SettingsController
  - TicketsController, KnowledgebaseController, NotificationsController
  - PluginsController, PluginManagerController, ApiClientsController
  - DatabaseManagmentController, DatabasesController
  - FileManagerController, ConsoleController
  - MountsController, ServerAllocationsController, ServerActivitiesController
  - MailController, MailTemplatesController
  - TranslationsController, CacheController
  - AffiliatesController, StorageSenseController
  - LocationsController, RealmsController
  - BackupController, LogViewerController, MetricsController
  - IntegrationsController, RegenPasswordController
  - SubdomainsController, PterodactylImporterController
  - OidcController, LdapController
  - NotificationsController, ChatController
  - DashboardController, KpiController
  - CloudController, PluginCssController, PluginJsController, PluginSidebarController

#### Admin Frontend Layout
- **File:** `frontendv2/src/app/(app)/admin/layout.tsx`
  - Sidebar navigation with admin sections organized in groups.
  - All sections accessible based on permissions.

### Admin Feature Summary

- Full CRUD for all entities from admin panel
- KPI dashboards with domain-specific analytics
- Bulk operations on servers/VMs/users
- Permission-gated admin sections
- User impersonation via SSO tokens
- Alt-account detection

---

## 7. Support Tickets

### Backend

#### Ticket System Controllers
- **File:** `backend/app/Controllers/Admin/TicketsController.php`
- **Endpoints:**
  - `GET /api/admin/tickets` — List all tickets with filters (status, priority, category, user, search).
  - `GET /api/admin/tickets/{uuid}` — View ticket with messages.
  - `PUT /api/admin/tickets/{uuid}/status` — Update status (open/in-progress/closed).
  - `POST /api/admin/tickets/{uuid}/reply` — Add reply (supports internal notes via `is_internal`).
  - `DELETE /api/admin/tickets/{uuid}` — Delete ticket.
- **User-facing controller** (likely): Ticket create, list own tickets, reply.

#### DB Schema (5 tables)
- `featherpanel_ticket_categories` — id, name, icon, color, support_email, open_hours, description.
- `featherpanel_ticket_priorities` — id, name, color. Seeds: Low/Medium/High.
- `featherpanel_ticket_statuses` — id, name, color. Seeds: Open/In Progress/Closed.
- `featherpanel_tickets` — id, uuid (unique), user_uuid (FK→users), server_id (FK→servers, nullable), category_id, priority_id, status_id, title, description, closed_at.
- `featherpanel_ticket_messages` — id, ticket_id (FK CASCADE), user_uuid, message, is_internal (staff-only).
- `featherpanel_ticket_attachments` — id, ticket_id, message_id, file_name, file_path, file_size, file_type, user_downloadable.

#### Key Design Decisions
- Categories have `open_hours` TEXT (JSON for business hours?).
- `is_internal` flag for staff-only messages.
- Attachments can be linked to ticket or specific message.
- `user_uuid` used as FK (not user.id) — consistent with FeatherPanel's UUID pattern.
- `ON DELETE RESTRICT` on category/priority/status — prevents deletion of referenced config.

### Ticket Feature Summary

- Ticket lifecycle: create, reply, close, reopen
- Categories with business hours, icons, colors
- Priority levels (Low/Medium/High) with colors
- Status workflow (Open → In Progress → Closed)
- Internal (staff-only) notes on replies
- File attachments per ticket/message
- Server association on tickets
- User association via UUID

---

## 8. Knowledge Base

### Backend

- **File:** `backend/app/Controllers/Admin/KnowledgebaseController.php`
- **Endpoints:**
  - `GET /api/knowledgebase/articles` — List published articles with category filtering.
  - `GET /api/knowledgebase/articles/{slug}` — View single article.
  - `POST /api/knowledgebase/articles/{id}/vote` — Vote on article helpfulness.
  - Admin CRUD for articles.
- **DB Tables:** `featherpanel_knowledgebase_articles` (likely with title, slug, content, category_id, published, votes).

### Knowledge Base Feature Summary

- Article browsing with category filtering
- Search across articles
- Helpfulness voting
- Admin CRUD for article management

---

## 9. Notifications

### Backend

- **File:** `backend/app/Controllers/Admin/NotificationsController.php`
- **Endpoints:**
  - `GET /api/notifications` — List user's notifications (paginated).
  - `POST /api/notifications/{id}/read` — Mark as read.
  - `POST /api/notifications/read-all` — Bulk mark read.
  - `GET /api/notifications/preferences` — Get notification preferences.
  - `PUT /api/notifications/preferences` — Update preferences.
- **DB Tables:** `featherpanel_notifications` (likely with user_uuid, title, body, type, read_at, data JSON).

### Frontend
- **File:** `frontendv2/src/contexts/NotificationContext.tsx` — Real-time notification state.
- **File:** `frontendv2/src/app/(app)/dashboard/notifications/page.tsx` — Notification list page.

### Notification Feature Summary

- In-app notification system
- Mark read/unread, bulk operations
- Configurable notification preferences
- Real-time updates (likely via polling or WebSocket)

---

## 10. Plugins & Extensions

### Backend

#### Plugin System
- **File:** `backend/app/App.php` — Plugin manager initialization, event dispatcher (`$eventManager`).
- **File:** `backend/app/Plugins/` directory contains:
  - **Dependencies/** — Dependency resolution with version constraints, circular detection.
  - **Events/Events/** — 49 event classes for plugin hooks across the system.
  - **Mixins/** — Mixin system for extending core functionality.
- **File:** `backend/app/Controllers/Admin/PluginsController.php` — Plugin listing, enable/disable, configure.
- **File:** `backend/app/Controllers/Admin/PluginManagerController.php` — Cloud marketplace integration for plugin downloads.

#### Plugin Architecture
- Plugins are stored in `storage/addons/` directory.
- Each plugin has `plugin.json` metadata file.
- Plugin lifecycle: install, boot, enable, disable, uninstall.
- Events emitted on all state-changing operations (CRUD on servers, users, nodes, etc.).
- Plugin sidebar items defined in `sidebar.json`/`sidebar.php`.
- Plugin widgets defined via backend widget controller.
- Plugin CSS/JS aggregated via dedicated controllers.

#### Frontend
- **File:** `frontendv2/src/app/(app)/admin/feathercloud/plugins/page.tsx` — Plugin marketplace browser with mock data.
- **File:** `frontendv2/src/hooks/usePluginRoutes.ts` — Dynamic plugin route integration.
- **File:** `frontendv2/src/hooks/usePluginWidgets.ts` — Plugin widget rendering hooks (global across all pages).
- Every page integrates `usePluginWidgets` with slot locations (top-of-page, after-header, before-list, bottom-of-page, etc.).

### Plugin Feature Summary

- Full plugin system with lifecycle hooks (boot, enable, disable, install, uninstall)
- 49 event hooks across the system
- Plugin-defined sidebar items and UI widgets
- Plugin CSS/JS auto-aggregation
- Cloud marketplace for plugin distribution
- Dependency resolution with version constraints
- Mixin system for core extension

---

## 11. API Keys & OAuth2

### Backend

#### API Clients
- **File:** `backend/app/Controllers/Admin/ApiClientsController.php`
- **Endpoints:**
  - `GET /api/admin/api-clients` — List API clients.
  - `POST /api/admin/api-clients` — Create API client.
  - `GET /api/admin/api-clients/{id}` — View client.
  - `PUT /api/admin/api-clients/{id}` — Update client.
  - `DELETE /api/admin/api-clients/{id}` — Delete client.
- **User endpoints:**
  - `GET /api/user/api-clients` — List user's API keys.
  - `POST /api/user/api-clients` — Create API key.
  - `DELETE /api/user/api-clients/{id}` — Delete API key.
- **Auth for API:** Bearer token (public_key + private_key) checked in AuthMiddleware as fallback after cookie auth.

#### OAuth2
- **File:** `backend/app/Controllers/System/CloudController.php` — OAuth2 callback handling.
- **DB Table:** `featherpanel_oauth2_api_authorizations` — id, request_token, auth_code, status (pending/approved/denied/expired), api_client_id (FK→apikeys_client), app_name, app_logo, callback_url, allowed_ips, expires_at, approved_at, used_at.

#### Frontend
- **File:** `frontendv2/src/app/(app)/dashboard/account/oauth2/api/new/page.tsx` — OAuth2 consent screen: app info, permissions requested, approve/deny. Handles user-mode and server-mode authorization. Error states with auto-redirect to login.

### API Keys Feature Summary

- Public/private key pair model
- IP restriction per API key
- Foreign IP notification on API key use
- Full OAuth2 authorization flow (request → approve/deny → callback)
- Consent screen with app info display
- Session vs server-mode authorization

---

## 12. System Configuration & Settings

### Backend

#### SettingsController (Admin)
- **File:** `backend/app/Controllers/Admin/SettingsController.php` (323 lines)
- **Endpoints:**
  - `GET /api/admin/settings` — List all settings (grouped by category).
  - `GET /api/admin/settings/{key}` — Get single setting.
  - `PUT /api/admin/settings/{key}` — Update setting.
  - `POST /api/admin/settings/batch` — Batch update settings.
  - `POST /api/admin/settings/email/test` — Test email configuration.
  - `POST /api/admin/settings/docker/update` — Trigger Docker image update.

#### Public Settings
- **File:** `backend/app/Controllers/System/SettingsController.php`
  - `GET /api/system/settings` — Exposes version, PHP info, hostname, telemetry status.
  - `GET /api/system/self-test` — Redis, MySQL, permissions health check (cached 1hr with "last known good" fallback).

#### Key Configuration Settings (inferred from code)
- `user_allow_login`, `user_allow_register` — Feature toggles
- `user_allow_*_change` — Per-field edit permission (username, email, password, etc.)
- `user_allow_api_keys_create` — API key creation permission
- `SERVER_ALLOW_USER_SERVER_DELETION`, `SERVER_ALLOW_EGG_CHANGE`, `SERVER_ALLOW_CUSTOM_DOCKER_IMAGE`, etc. — Server feature toggles
- `captcha_provider` — CAPTCHA provider selection
- `encryption_key` — For encrypting stored credentials
- `featherpanel_blocked_email_domains` — Blocked email domains for registration
- Rate limit configuration

#### Settings DB
- `featherpanel_settings` — Simple key-value store (name TEXT, value TEXT).

### Settings Feature Summary

- Key-value configuration store
- Category-grouped settings
- Batch update support
- Email test endpoint
- Docker update trigger
- Self-test endpoint with caching
- Feature toggles for almost every user-facing capability

---

## 13. SSH Keys

### Backend

- **Controller:** User SSH key management (likely in user controllers). CRUD for SSH keys.
- **Entity:** `backend/app/Chat/SshKey.php` (or similar).
- **DB Table:** `featherpanel_user_ssh_keys` — Linked to user UUID. Stores public key, fingerprint, label, created_at, deleted_at (soft delete).

### Frontend
- **File:** `frontendv2/src/components/account/SshKeysTab.tsx` — SSH key list, add, edit, view, soft delete, hard delete, restore. Search, fingerprint display, confirmation dialogs.

### SSH Key Feature Summary

- Full CRUD with soft delete/restore
- Fingerprint display
- Search/filter
- Confirmation dialogs for destructive actions

---

## 14. Subusers (Server-level Permissions)

### Backend

#### SubuserController (Game Servers)
- **File:** `backend/app/Controllers/User/Server/SubuserController.php`
- CRUD for server subusers.
- Permission assignment per subuser (using permission node constants from `SubuserPermissions.php`).

#### VmUserSubuserController (VMs)
- **File:** `backend/app/Controllers/User/Vds/VmUserSubuserController.php`
- Same pattern for VM subusers.

#### DB Schema
- `featherpanel_server_subusers` — id, user_id, server_id, permissions (JSON), created_at, updated_at. Composite index on (user_id, server_id).
- `featherpanel_vm_subusers` — Similar structure for VMs.

#### Frontend
- **File:** `frontendv2/src/app/(app)/server/[uuidShort]/users/page.tsx` — Subuser management with permission checkboxes.
- **File:** `frontendv2/src/app/(app)/vds/[id]/users/page.tsx` — VM subuser management.

### Subuser Feature Summary

- Invite users to access specific servers/VMs
- Granular permission assignment per subuser
- JSON-stored permissions
- Separate systems for game servers and VMs

---

## 15. File Manager

### Backend

- **Controller:** File manager endpoints (likely in `ServerFileController.php` under User/Server/).
- **Operations:** List directory, read file, write file, create file, create directory, rename, delete, upload, download, compress, decompress.
- **Communication:** Via Wings daemon (WebSocket for real-time operations).

### Frontend
- **File:** `frontendv2/src/app/(app)/server/[uuidShort]/files/page.tsx` — File manager UI.
- **File:** `frontendv2/src/hooks/useFileManager.ts` — File manager state and operations hook.
- Features: tree view, file editor, upload progress, compress/decompress, drag-and-drop likely supported.

### File Manager Feature Summary

- Full file CRUD via Wings daemon
- Upload/download with progress
- Compress/decompress (zip/tar)
- WebSocket for real-time operations
- File editing in browser

---

## 16. Backups

### Backend

#### Game Server Backups (Wings-based)
- **Controller:** `ServerBackupController.php` — Full CRUD, lock/unlock, restore, download.
- **Entity:** `Backup.php` — Links to server, tracks UUID, upload_id, success, lock status, checksum, bytes, completion time.
- **Retention:** `BackupFifoEviction.php` — Panel-level default (`hard_limit` or `fifo_rolling`), per-server overrides.

#### VM Backups (Proxmox-based)
- **Controller:** `VmUserBackupController.php` — Create (async), restore (async), list, delete.
- **DB Table:** `featherpanel_vm_instance_backups` — Links to VM instance, stores Proxmox volume ID, storage, size, format.
- **Processing:** Async via Rust Runner (vzdump via Proxmox API).

### Backups Feature Summary

- Game servers: Wings-based backup with FIFO eviction policy
- VMs: Proxmox vzdump-based backup with async processing
- Lock/unlock to prevent deletion
- Download with JWT-signed URLs (5-min expiry)
- Retention policy: hard_limit or FIFO rolling
- Restore from backup (sync for Wings, async for Proxmox)

---

## 17. Schedules & Tasks

### Backend

#### ServerScheduleController
- **File:** `backend/app/Controllers/User/Server/ServerScheduleController.php`
- CRUD for cron schedules per server.
- Each schedule has multiple tasks (commands to execute).

#### TaskController
- **File:** `backend/app/Controllers/User/Server/TaskController.php`
- Task CRUD within schedules.
- Reorder tasks.
- Task types: command, backup, etc.

#### DB Schema
- `featherpanel_server_schedules` — id, server_id, name, cron expression, timezone, is_active, last_run_at, next_run_at.
- `featherpanel_server_tasks` — id, schedule_id, sequence_id, action, payload (command), time_offset, is_active.

### Schedules Feature Summary

- Cron-based scheduling per server
- Multiple tasks per schedule with ordering
- Task types: commands, backups
- Toggle enable/disable
- Last/next run tracking

---

## 18. Databases

### Backend

#### ServerDatabaseController (1955 lines)
- **File:** `backend/app/Controllers/User/Server/ServerDatabaseController.php`
- CRUD, rotate password, list hosts, test connection.
- Supports MySQL, MariaDB, PostgreSQL on external hosts.

#### Database Host Management
- **File:** `backend/app/Controllers/Admin/DatabaseManagmentController.php`
- CRUD for database hosts (external database servers).

#### DB Schema
- `featherpanel_database_instances` — External DB host config (host, port, username, encrypted password, provider, max_databases).
- `featherpanel_server_databases` — Per-server database assignments (name, username, encrypted password, remote pattern, max_connections).
- `featherpanel_server_backups` — Database snapshots/backups.

#### Key Design
- Database names auto-generated: `s{server_id}_{name}`
- Usernames auto-generated: `u{server_id}_{random10}`
- Passwords auto-generated and encrypted
- Rollback on failure (delete from DB host if record creation fails)

### Databases Feature Summary

- External database hosting (MySQL/MariaDB/PostgreSQL)
- Auto-generated credentials
- Password rotation
- Connection testing
- Per-server database limits
- Host-level max database limits
- Database backups/snapshots

---

## 19. Firewall

### Backend

- **Controller:** `ServerFirewallController.php` — CRUD for firewall rules.
- **Rule types:** Allow, deny. By IP, port, protocol.
- **Sync:** Rules synced to Wings daemon for enforcement.
- **DB Table:** `featherpanel_server_firewall_rules` (likely).

### Frontend
- **File:** `frontendv2/src/app/(app)/server/[uuidShort]/firewall/page.tsx`
  - Rule list with status indicators.
  - Add rule form (type, IP, port, protocol).
  - Delete with confirmation.

### Firewall Feature Summary

- Allow/deny rules per server
- IP, port, and protocol filtering
- Synced to Wings daemon for enforcement

---

## 20. Proxy / Subdomains

### Backend

#### Proxy Controller
- **File:** `backend/app/Controllers/User/Server/ServerProxyController.php`
- Nginx reverse proxy configuration management.
- Create/delete/list proxy configs per server.
- Synced to Wings daemon.

#### Subdomain Controller
- **File:** `backend/app/Controllers/User/Server/SubdomainController.php`
- Subdomain assignments per server.
- Create/delete/list subdomains.

### Proxy/Subdomain Feature Summary

- Nginx reverse proxy configuration per server
- Subdomain assignment and management

---

## 21. Monitoring & Analytics (KPI)

### Backend KPI Files (6 files)

| File | What it measures |
|------|-----------------|
| `VdsAnalytics.php` | VM dashboard metrics: nodes, templates, instances, backups, tasks |
| `ServerAnalytics.php` | Server counts by status, resource usage, backup/database distribution |
| `UserAnalytics.php` | User registration trends, role distribution, top users by server/VM count |
| `InfrastructureAnalytics.php` | Locations, nodes, allocations, database host statistics |
| `ContentAnalytics.php` | Realms, spells, images, redirect link statistics |
| `SystemAnalytics.php` | Mail queue stats, API key/SSH key counts, plugin adoption |

### Frontend
- **File:** `frontendv2/src/app/(app)/admin/page.tsx` — Admin dashboard displaying KPI data.

### Monitoring Feature Summary

- Domain-specific analytics endpoints
- Infrastructure, server, VM, user, content, and system KPIs
- All read-only aggregate queries
- Used for admin dashboard visualization

---

## 22. Email / Mail System

### Backend

- **File:** `backend/app/Controllers/Admin/MailController.php` — Mail queue management (list, resend, delete).
- **File:** `backend/app/Controllers/Admin/MailTemplatesController.php` — Email template CRUD.
- **Dependencies:** PHPMailer (`phpmailer/phpmailer`).
- **Queue:** Emails sent via async queue (Rust runner from Redis channel `featherpanel:mail:pending`).
- **DB Tables:**
  - `featherpanel_mail_queue` — id, to, subject, body, status (pending/sent/failed), attempts, created_at.
  - `featherpanel_mail_templates` — id, name, subject, body (HTML), variables, created_at.

### Frontend
- **File:** `frontendv2/src/components/account/MailTab.tsx` — User's email history with status badges, preview, resend.

### Email Feature Summary

- Queue-based email sending via async Rust runner
- HTML email templates with variables
- Send status tracking (pending/sent/failed)
- Resend failed emails
- Email history per user
- Test email endpoint in admin settings

---

## 23. i18n / Translations

### Backend
- **File:** `backend/app/Controllers/System/TranslationsController.php` (310 lines)
  - i18n system with language fallback chain.
  - Caching support.
  - Language mapping (e.g., `en-US` → `en`).
  - Enabled language filtering.

### Frontend
- **File:** `frontendv2/src/contexts/TranslationContext.tsx` — Translation provider.
- **File:** `frontendv2/public/locales/en.json` — English translations.
- **File:** `frontendv2/src/app/(app)/auth/layout.tsx` — Auth layout with logo, theme support, branding footer.

### i18n Feature Summary

- JSON-based translation files
- Language fallback chain
- Frontend context provider for translations

---

## 24. Chatbot / AI

### Backend
- **File:** `backend/app/Services/Chatbot/` — Chatbot service (likely AI-powered support assistant).
- **File:** `backend/app/Controllers/Admin/ChatController.php` — Chat conversation management.
- **DB Tables:**
  - `featherpanel_chat_conversations` — id, user_uuid, status, created_at.
  - `featherpanel_chat_messages` — id, conversation_id, role (user/assistant), content, created_at.

### Frontend
- **File:** `frontendv2/src/components/ai/` — AI chatbot UI components (3 files).
- **File:** `frontendv2/src/lib/api/chatbotService.ts` — Chatbot API client.
- **File:** `frontendv2/src/lib/api/chatbotActions.ts` — Chatbot action handlers.

### Chatbot Feature Summary

- AI-powered support chatbot
- Conversation history
- Admin conversation management

---

## 25. Runner (Rust Async Processor)

### Architecture
- **Language:** Rust (tokio async runtime)
- **Purpose:** Long-running async operations that would block PHP
- **Communication:** Redis PubSub channels + MySQL task table polling

### Components

#### main.rs (76 lines)
- Initializes logging (file + stdout).
- Loads config from environment.
- Connects to MySQL.
- Inits settings cache.
- Starts Redis listener.

#### redis/listener.rs (184 lines)
- Redis PubSub listener with auto-reconnect.
- Subscribes to `featherpanel:mail:pending`, `featherpanel:vm:pending`, `featherpanel:settings:reload`.
- Dispatches to: `process_vm_task()` for VM operations, `send_email()` for mail, `reload_settings()` for config reloads.

#### processor/create.rs (1202 lines)
- State-machine for VM creation:
  1. `initial` — Clone from template (QEMU or LXC).
  2. `resize` — Resize disk to plan size.
  3. `config` — Apply VM configuration (CPU, RAM, network, cloud-init).
  4. `start` — Start VM.
  5. `finalize` — Update DB record with VM ID and status.
- `handle_reinstall_task()` — VM reinstall via template redeploy.
- `send_vm_email()` — Email notifications for create/fail.

#### processor/vm.rs (1159 lines)
- Main VM task processing loop.
- Handles: power actions, backup, restore, resize, delete, create (delegates to create.rs).
- UPID tracking for Proxmox task status polling.
- Database record creation for backups.
- Status transitions: `pending → running → completed/failed`.

#### proxmox/client.rs (164 lines)
- Proxmox API client (Rust).
- GET/POST/PUT/DELETE methods.
- PVEAPIToken auth via Authorization header.
- Custom headers/params support.

#### proxmox/actions.rs (254 lines)
- `clone_qemu()` / `clone_lxc()` — Clone from template.
- `power_action()` — Start/stop/restart/kill.
- `resize_disk()` / `resize_memory()` / `resize_cpu()` / `resize_swap()`.
- `create_vzdump()` — Backup creation.
- `restore_vzdump()` — Backup restore.
- `delete_backup()` — Delete backup.
- `get_task_status()` — Poll Proxmox task.
- `set_vm_config()` — Apply VM configuration.
- `get_storage_content()` — List ISO/template images.

#### encryption/mod.rs
- Encryption/decryption using ChaCha20Poly1305.

#### Key Dependencies
- `tokio` — Async runtime.
- `redis` — Redis client.
- `sqlx` — Async MySQL driver.
- `lettre` — Email sending.
- `reqwest` — HTTP client (Proxmox API).
- `chacha20poly1305` — Encryption.

### Runner Feature Summary

- Async task processing for long-running VM operations
- Redis PubSub for job distribution
- MySQL task table for status tracking
- Proxmox API client for VM operations
- Mail sending via `lettre` crate
- Settings cache reload
- Encrypted credential handling

---

## 26. Billing, Plans, Subscriptions

### Critical Finding: NONE EXIST

**FeatherPanel does NOT have a built-in billing, plans, subscriptions, invoices, wallet, coupons, or store system.** This is the single most important finding for CloudNest, as CloudNest *does* have a comprehensive billing system.

#### Evidence
1. **Zero billing-related files** in controllers, entities, services, or routes.
2. **`featherpanel_vm_plans` table was created and dropped** within 3 days (March 5-8, 2026). The `plan_id` column on `featherpanel_vm_instances` is vestigial and always NULL.
3. **VM ordering flow has no billing check** — VMs are created by admins only, with no credit check, balance check, or subscription verification.
4. **Plugin marketplace references** `billingcore`, `billingresources`, `billingreferrals` as external plugins to download from FeatherCloud — these are not in the repository.

#### What FeatherPanel has instead
- **AffiliatesShowcase** component — displays external hosting affiliates from a static JSON feed (marketing, not billing).
- **Plugin system** that can extend functionality — billing would be an external plugin.

#### Implications for CloudNest
- FeatherPanel offers **no reference architecture for billing** that CloudNest could adapt.
- CloudNest's existing billing system (wallet, invoices, subscriptions, plans, vouchers) is already more advanced.
- FeatherPanel's lack of billing confirms that CloudNest's approach (built-in billing from day one) is the right architectural choice.

---

## 27. Feature Inventory Table

| # | Feature | Domain | FeatherPanel Location | Applicable to CloudNest | Notes |
|---|---------|--------|----------------------|------------------------|-------|
| 1 | Email/password login | Auth | `Auth/LoginController.php` | Yes | CloudNest has this |
| 2 | Passwordless email login | Auth | `EmailLoginController.php` | Partial | CloudNest could add |
| 3 | WebAuthn passkeys | Auth | `PasskeyController.php` | Partial | CloudNest could add (FIDO2) |
| 4 | TOTP 2FA | Auth | `TwoFactorController.php` | Yes | CloudNest has this |
| 5 | Discord OAuth | Auth | `DiscordController.php` | No | CloudNest uses different social login |
| 6 | Generic OIDC | Auth | `OidcController.php` | Partial | CloudNest could add for enterprise |
| 7 | LDAP auth | Auth | `LdapController.php` | Partial | CloudNest could add for enterprise |
| 8 | CAPTCHA (Turnstile/hCaptcha/reCAPTCHA) | Auth | `CaptchaHelper.php` | Partial | CloudNest uses Turnstile |
| 9 | Email verification | Auth | `VerifyEmailController.php` | Yes | CloudNest has this |
| 10 | Password reset | Auth | `ForgotPasswordController.php` | Yes | CloudNest has this |
| 11 | User registration | Auth | `RegisterController.php` | Yes | CloudNest has this |
| 12 | "Remember me" cookie auth | Auth | `AuthMiddleware.php` | Partial | CloudNest uses JWT only |
| 13 | Device fingerprint tracking | Auth | `UserDeviceTracker.php` | No | CloudNest doesn't do this |
| 14 | Alt-account detection | Admin | `UsersController::potential-alts` | No | CloudNest doesn't do this |
| 15 | Admin impersonation via SSO | Admin | `UsersController::sso-tokens` | Partial | CloudNest has impersonate |
| 16 | Hierarchical permissions (80+ nodes) | Permissions | `Permissions.php` | Yes | CloudNest has roles/permissions |
| 17 | Role management with colors/badges | Permissions | `RolesController.php` | Partial | CloudNest has roles |
| 18 | Server subusers (granular perms) | Permissions | `SubuserPermissions.php` | Yes | CloudNest has subusers |
| 19 | Permission guard component (UI) | Permissions | `PermissionGuard.tsx` | Yes | CloudNest should add |
| 20 | Game server lifecycle | Servers | `ServersController.php` | No | Game servers only, not CloudNest focus |
| 21 | Console terminal (WebSocket) | Servers | `ServerTerminal.tsx` (53KB) | Yes | CloudNest VM console could use |
| 22 | Server performance graphs | Servers | `ServerPerformance.tsx` | Yes | CloudNest has some |
| 23 | Server reinstall | Servers | `ServerUserController::reinstall` | Yes | CloudNest has reinstall |
| 24 | Server power actions | Servers | Power controller | Yes | CloudNest has this |
| 25 | Firewall rules per server | Servers | `ServerFirewallController.php` | Yes | CloudNest has firewall UI |
| 26 | Nginx proxy config per server | Servers | `ServerProxyController.php` | No | Game server specific |
| 27 | FastDL for game assets | Servers | `ServerFastDlController.php` | No | Game server specific |
| 28 | Schedule/cron tasks | Servers | `ServerScheduleController.php` | No | Game server cron |
| 29 | Server file manager | Servers | File manager endpoints | No | Game server files |
| 30 | Database hosting per server | Servers | `ServerDatabaseController.php` | No | Game server DBs |
| 31 | VM lifecycle (create/start/stop/restart/kill/delete) | VDS | `VmUserInstanceController.php` | Yes | CloudNest has this |
| 32 | VM provisioning from template (async) | VDS | Runner `create.rs` | Yes | CloudNest uses BullMQ |
| 33 | VNC console | VDS | `VncTicket` endpoint + noVNC | Yes | CloudNest has noVNC |
| 34 | QEMU hardware config (BIOS/EFI/TPM) | VDS | `patchQemuHardware()` | Yes | CloudNest should add |
| 35 | ISO mount/unmount (URL fetch) | VDS | ISO endpoints | Yes | CloudNest could add |
| 36 | Network config (IPs, DNS) | VDS | Network endpoints | Yes | CloudNest has some |
| 37 | VM reinstall from template | VDS | `reinstall()` async | Yes | CloudNest has this |
| 38 | VM backups (vzdump, async) | VDS | `VmUserBackupController.php` | Yes | CloudNest has backups |
| 39 | VM restore from backup | VDS | `restoreBackup()` async | Yes | CloudNest has restore |
| 40 | VM subusers | VDS | `VmUserSubuserController.php` | Partial | CloudNest has vm-subusers |
| 41 | VM activity log | VDS | `VmUserActivityController.php` | Yes | CloudNest has activity log |
| 42 | Proxmox node CRUD | Nodes | `VmNodesController.php` | Yes | CloudNest has nodes |
| 43 | Proxmox IP pool management | Nodes | IP pool endpoints | Yes | CloudNest has IP pools |
| 44 | Proxmox storage config | Nodes | Storage endpoints | No | CloudNest configures per-node |
| 45 | Node locations | Nodes | `Location.php` | Yes | CloudNest just added |
| 46 | Node maintenance mode | Nodes | Node maintenance toggle | Yes | CloudNest should add |
| 47 | Node test connection | Nodes | Test connection endpoint | Yes | CloudNest should add |
| 48 | Wings daemon YAML config generation | Nodes | `Node.php` | No | Game server specific |
| 49 | Support tickets (with categories/priority) | Support | Ticket controllers + 5 tables | Yes | CloudNest has tickets |
| 50 | Internal (staff-only) ticket notes | Support | `is_internal` flag | Partial | CloudNest could add |
| 51 | Knowledge base with voting | KB | Knowledgebase controller | Yes | CloudNest could add |
| 52 | In-app notifications | Notifications | Notification context + endpoints | Yes | CloudNest has notifications |
| 53 | Plugin system with 49 events | Plugins | `Plugins/` directory | Partial | CloudNest has module system |
| 54 | Plugin marketplace | Plugins | FeatherCloud plugin browser | No | Out of scope for CloudNest |
| 55 | API keys (public/private key pair) | API Keys | `ApiClientsController.php` | Yes | CloudNest has API keys |
| 56 | OAuth2 authorization flow | API Keys | OAuth2 controller + DB table | Yes | CloudNest should add |
| 57 | SSH keys | SSH Keys | SSH key CRUD + frontend | Yes | CloudNest has SSH keys |
| 58 | System settings (key-value) | Settings | `SettingsController.php` | Yes | CloudNest has settings |
| 59 | Feature toggles per capability | Settings | Per-setting gating | Yes | CloudNest should adopt |
| 60 | Email templates | Email | `MailTemplatesController.php` | Yes | CloudNest has notification templates |
| 61 | Mail queue + async sending | Email | Runner + mail queue DB table | Yes | CloudNest uses BullMQ for mail |
| 62 | KPI analytics (6 domains) | Analytics | `KPI/` directory | Yes | CloudNest just added analytics |
| 63 | Self-test / health check | System | `SelfTest.php` | Yes | CloudNest should add |
| 64 | i18n translations | System | Translations controller + JSON files | Yes | CloudNest should add |
| 65 | AI chatbot | AI | Chatbot service + frontend | No | Out of scope for CloudNest |
| 66 | Rust async runner | Runner | `runner/` (tokio + sqlx) | N/A | CloudNest uses BullMQ (Node.js) |
| 67 | Proxmox API client (PHP + Rust) | Runner | `Proxmox.php` + proxmox/ in runner | Yes | CloudNest has Proxmox service |
| 68 | Backup FIFO eviction policy | Backups | `BackupFifoEviction.php` | Yes | CloudNest should add |
| 69 | JWT-signed download URLs | Backups | Download URL with 5-min expiry | Yes | CloudNest should add |
| 70 | Rate limiting per route | System | RateLimit middleware + config | Yes | CloudNest has rate limiting |
| 71 | Plugin widget system (UI slots) | Plugins | `usePluginWidgets` hook | No | Plugin architecture differs |
| 72 | Suspended server overlay (UI) | UX | Suspended server wrapper | Yes | CloudNest should add |
| 73 | Grid/list view toggle | UX | `useServersState` / `useVmsState` | Yes | CloudNest just added |
| 74 | Billing system | Billing | **NONE** | N/A | CloudNest has comprehensive billing |
| 75 | Usage metering | Billing | **NONE** | N/A | CloudNest has subscription metering |
| 76 | Invoice generation | Billing | **NONE** | N/A | CloudNest has invoices |
| 77 | Wallet/credits | Billing | **NONE** | N/A | CloudNest has wallet |
| 78 | Voucher/coupon system | Billing | **NONE** | N/A | CloudNest has vouchers |
| 79 | Subscription plans | Billing | **NONE** | N/A | CloudNest has subscriptions |
| 80 | Stripe/PayPal/crypto payment gateways | Billing | **NONE** | N/A | CloudNest has Stripe |

---

## Key Architectural Findings for CloudNest

### What FeatherPanel Does Better
1. **Plugin system with event hooks** — 49 events across the system. CloudNest's module system is static (NestJS modules), no dynamic plugin loading.
2. **Subuser permissions stored as JSON** — Simple and flexible. CloudNest uses a join table approach.
3. **Device fingerprint tracking** — For security auditing. CloudNest doesn't track this.
4. **CAPTCHA on every sensitive action** — Registration, login, 2FA setup, profile changes. CloudNest only uses it on login.
5. **Grid/list view toggle with localStorage persistence** — CloudNest just added this.
6. **Suspended server wrapper** — Shows an overlay on suspended servers blocking actions. CloudNest should add.
7. **PermissionGuard component** — UI-level permission gating. CloudNest should adopt.
8. **Modal/dialog confirmation for destructive actions** — Consistent pattern throughout.
9. **SSH key soft delete with restore** — CloudNest could improve.
10. **Email preview inline in mail history** — Nice UX touch.

### What CloudNest Does Better
1. **Four-layer separation** (controller → service → repository → Prisma) — FeatherPanel uses static PDO methods in entity classes.
2. **BullMQ job queue with idempotency keys** — FeatherPanel uses Redis PubSub (no delivery guarantees, no idempotency).
3. **Comprehensive billing system** — FeatherPanel has zero billing.
4. **Prisma ORM with migrations** — FeatherPanel uses raw SQL migrations and hand-rolled PDO.
5. **Swagger/OpenAPI docs** — FeatherPanel has Swagger annotations too (via `zircote/swagger-php`), but CloudNest's NestJS Swagger integration is more automated.
6. **Resource pool admission checks in transactions** — FeatherPanel has check-then-act race conditions.
7. **Audit logging in same DB transaction** — FeatherPanel uses activity tables, but not always transactionally.
8. **ip6/dual stack** — FeatherPanel supports it but CloudNest has better structured networking.
9. **TypeScript throughout** — FeatherPanel is PHP/TypeScript mixed with different paradigms.

### Red Flags to Avoid from FeatherPanel
1. **Static methods in entity classes** — Makes testing and DI hard. Use NestJS DI pattern.
2. **Check-then-act without transactions** — Race conditions on limit checks.
3. **No idempotency on async operations** — Retries could double-provision.
4. **Sensitive credentials in TEXT columns** — Encryption at app layer is fragile.
5. **ENUM('false','true') instead of BOOLEAN** — Legacy MySQL pattern.
6. **No payment/billing** — Couldn't run a hosting business without it.
7. **Giant controller files** (ServersController.php is 155KB) — NestJS thin controller pattern is better.

### Recommendations for CloudNest
1. **Adopt FeatherPanel's suspended server overlay pattern** — UX improvement.
2. **Add CAPTCHA to registration, 2FA setup, and profile changes** — Security improvement.
3. **Add PermissionGuard component** — Cleaner UI gating.
4. **Add grid/list view toggle with localStorage** — Already done.
5. **Consider adding OIDC and LDAP authentication** — Enterprise feature.
6. **Consider adding WebAuthn passkeys** — Passwordless future.
7. **Add node test connection endpoint** — Already planned.
8. **Consider JSON-stored subuser permissions** — Simpler than join tables.
9. **Add device fingerprint tracking** — Security audit feature.
10. **Add email template management** — Flexible notification system.
