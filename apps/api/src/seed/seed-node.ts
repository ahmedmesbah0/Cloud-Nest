import path from 'node:path';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { loadAppEnv } from './load-env';

// Load .env from the repo root (three levels up from apps/api/src/seed/),
// then fall back to cwd. This makes `npm run seed -w apps/api` work.
const repoRoot = path.resolve(__dirname, '..', '..', '..');
loadAppEnv(path.resolve(repoRoot, '.env'));
if (!process.env.DATABASE_URL) {
  loadAppEnv(path.resolve(process.cwd(), '.env'));
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) as any });

async function seedNode() {
  const proxmoxNodeId = process.env.PROXMOX_NODE || 'pve';
  const host = process.env.PROXMOX_HOST || '172.16.1.10';
  const port = parseInt(process.env.PROXMOX_PORT || '8006', 10);

  const existing = await prisma.node.findUnique({
    where: { proxmoxNodeId },
  });

  if (existing) {
    console.log(`Node "${proxmoxNodeId}" already exists, updating...`);
    await prisma.node.update({
      where: { proxmoxNodeId },
      data: { host, port, name: proxmoxNodeId, isActive: true },
    });

    await prisma.nodeInventory.update({
      where: { nodeId: existing.id },
      data: {
        totalCores: 16,
        totalMemoryMb: 65536,
        totalDiskGb: 4000,
      },
    });
  } else {
    const node = await prisma.node.create({
      data: {
        proxmoxNodeId,
        name: proxmoxNodeId,
        host,
        port,
        isActive: true,
      },
    });

    await prisma.nodeInventory.create({
      data: {
        nodeId: node.id,
        totalCores: 16,
        totalMemoryMb: 65536,
        totalDiskGb: 4000,
      },
    });

    console.log(`Node "${proxmoxNodeId}" created with inventory`);
  }

  console.log('Node seed complete.');
}

seedNode()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
