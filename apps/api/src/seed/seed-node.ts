import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
