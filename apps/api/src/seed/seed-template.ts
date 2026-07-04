import path from 'node:path';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { loadAppEnv } from './load-env';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
loadAppEnv(path.resolve(repoRoot, '.env'));
if (!process.env.DATABASE_URL) {
  loadAppEnv(path.resolve(process.cwd(), '.env'));
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) as any });

const templates = [
  { name: 'Ubuntu 22.04', proxmoxTemplateId: 'ubuntu-2204', osType: 'linux', minDiskGb: 5, minMemoryMb: 512 },
  { name: 'Ubuntu 24.04', proxmoxTemplateId: 'ubuntu-2404', osType: 'linux', minDiskGb: 5, minMemoryMb: 512 },
  { name: 'Debian 12', proxmoxTemplateId: 'debian-12', osType: 'linux', minDiskGb: 5, minMemoryMb: 512 },
  { name: 'Debian 11', proxmoxTemplateId: 'debian-11', osType: 'linux', minDiskGb: 5, minMemoryMb: 512 },
  { name: 'CentOS 9 Stream', proxmoxTemplateId: 'centos-9', osType: 'linux', minDiskGb: 10, minMemoryMb: 1024 },
  { name: 'AlmaLinux 9', proxmoxTemplateId: 'almalinux-9', osType: 'linux', minDiskGb: 10, minMemoryMb: 1024 },
  { name: 'Rocky Linux 9', proxmoxTemplateId: 'rocky-9', osType: 'linux', minDiskGb: 10, minMemoryMb: 1024 },
  { name: 'Fedora 40', proxmoxTemplateId: 'fedora-40', osType: 'linux', minDiskGb: 10, minMemoryMb: 1024 },
  { name: 'Windows Server 2022', proxmoxTemplateId: 'windows-2022', osType: 'windows', minDiskGb: 32, minMemoryMb: 2048 },
  { name: 'Windows Server 2019', proxmoxTemplateId: 'windows-2019', osType: 'windows', minDiskGb: 32, minMemoryMb: 2048 },
];

async function seedTemplates() {
  let created = 0;
  let updated = 0;

  for (const tpl of templates) {
    const existing = await prisma.vmTemplate.findFirst({
      where: { proxmoxTemplateId: tpl.proxmoxTemplateId },
    });

    if (existing) {
      await prisma.vmTemplate.update({
        where: { id: existing.id },
        data: { ...tpl, isActive: true },
      });
      updated++;
    } else {
      await prisma.vmTemplate.create({ data: tpl });
      created++;
    }
  }

  console.log(`Template seed complete: ${created} created, ${updated} updated`);
}

seedTemplates()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
