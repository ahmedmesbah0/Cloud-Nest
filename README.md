# CloudNest

Self-service VPS hosting platform — backend (NestJS + Prisma + PostgreSQL + Redis/BullMQ) and frontend (Next.js + Tailwind).

## One-Click Install

```bash
curl -sSL https://raw.githubusercontent.com/ahmedmesbah0/Cloud-Nest/main/scripts/install.sh | bash
```

This will clone the repo, install dependencies, set up the database, generate JWT secrets, and build the project. Edit `.env` with your database, Redis, and Proxmox details before running.

## Manual Setup

```bash
git clone https://github.com/ahmedmesbah0/Cloud-Nest.git
cd Cloud-Nest
cp .env.example .env
# Edit .env with your credentials
npm install
npm run prisma:generate
npm run prisma:push
npm run build
npm run dev
```

## Prerequisites

- Node.js >= 18
- PostgreSQL 14+
- Redis 6+

## Documentation

- API docs: http://localhost:3000/api/docs (after starting backend)
- Full plan: [docs/CloudNest_Master_Plan.md](docs/CloudNest_Master_Plan.md)

## Install, Update & Uninstall (via curl)

The installer script used above can also be used to update or uninstall an existing installation. Run the same curl command and follow the interactive menu it prints:

```bash
curl -sSL https://raw.githubusercontent.com/ahmedmesbah0/Cloud-Nest/main/scripts/install.sh | bash
# then choose one of the menu options: 1) install  2) update  3) uninstall  4) exit
```

- **When to update:** Re-run the command whenever you want to pull upstream changes (new features, bugfixes or security patches). Before updating, backup important data (database, files), and prefer updating during a maintenance window. A safe manual update sequence is:

```bash
# stop services, fetch latest, rebuild, and restart
pm2 stop cloudnest-api cloudnest-web || true
cd "$HOME/cloudnest" || exit 1
git fetch origin main && git reset --hard origin/main
npm install
npm run build
pm2 restart cloudnest-api cloudnest-web || pm2 start ecosystem.config.cjs --env production
pm2 save
```

- **How to uninstall:** The installer menu offers an uninstall option. If you prefer to uninstall manually, first back up your database and any important files, then run:

```bash
# stop and remove PM2 processes
pm2 delete cloudnest-api cloudnest-web || true
pm2 save || true

# remove the installation directory (default: $HOME/cloudnest)
rm -rf "$HOME/cloudnest"

# optionally drop the PostgreSQL database and user (be careful)
# sudo -u postgres dropdb cloudnest
# sudo -u postgres dropuser cloudnest
```

Always verify backups before uninstalling. If you rely on the installer menu option, it will attempt to clean up installed files and processes for you.
