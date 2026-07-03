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
