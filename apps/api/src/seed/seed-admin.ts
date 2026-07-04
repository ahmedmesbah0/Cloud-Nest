import path from 'node:path';
import * as argon2 from 'argon2';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { loadAppEnv } from './load-env';

// Load .env from the repo root (three levels up from apps/api/src/seed/),
// then fall back to cwd. This makes `npm run seed:admin -w apps/api` work
// because npm sets cwd to apps/api, not the repo root.
const repoRoot = path.resolve(__dirname, '..', '..', '..');
loadAppEnv(path.resolve(repoRoot, '.env'));
if (!process.env.DATABASE_URL) {
  loadAppEnv(path.resolve(process.cwd(), '.env'));
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) as any });

function getAdminCredentials() {
  const emailArg = process.argv[2] || process.env.ADMIN_EMAIL;
  const passwordArg = process.argv[3] || process.env.ADMIN_PASSWORD;

  if (!emailArg) {
    throw new Error('ADMIN_EMAIL is required');
  }
  if (!passwordArg) {
    throw new Error('ADMIN_PASSWORD is required');
  }

  return { email: emailArg, password: passwordArg };
}

export async function seedAdmin(emailArg?: string, passwordArg?: string) {
  const { email, password } = { email: emailArg, password: passwordArg };
  const resolvedEmail = email || process.env.ADMIN_EMAIL || 'admin';
  const resolvedPassword = password || process.env.ADMIN_PASSWORD || 'AdminP4ss!';

  const existing = await prisma.user.findUnique({ where: { email: resolvedEmail } });
  if (existing) {
    console.log(`Admin user already exists: ${resolvedEmail}`);
    return;
  }

  const passwordHash = await argon2.hash(resolvedPassword);

  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin', description: 'Administrator with full access' },
  });

  const customerRole = await prisma.role.upsert({
    where: { name: 'customer' },
    update: {},
    create: { name: 'customer', description: 'Standard customer' },
  });

  const allPermissions = [
    { action: 'manage', resource: 'users' },
    { action: 'manage', resource: 'vms' },
    { action: 'manage', resource: 'nodes' },
    { action: 'manage', resource: 'settings' },
    { action: 'manage', resource: 'vouchers' },
    { action: 'manage', resource: 'invoices' },
    { action: 'manage', resource: 'wallets' },
    { action: 'manage', resource: 'roles' },
    { action: 'manage', resource: 'permissions' },
    { action: 'read', resource: 'audit-logs' },
  ];

  for (const perm of allPermissions) {
    const created = await prisma.permission.upsert({
      where: { id: `${perm.action}:${perm.resource}` },
      update: {},
      create: { id: `${perm.action}:${perm.resource}`, action: perm.action, resource: perm.resource },
    });

    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: created.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: created.id },
    });
  }

  const user = await prisma.user.create({
    data: {
      email: resolvedEmail,
      passwordHash,
      name: 'Admin',
      emailVerified: true,
    },
  });

  await prisma.userRole.create({
    data: { userId: user.id, roleId: adminRole.id },
  });

  await prisma.userRole.create({
    data: { userId: user.id, roleId: customerRole.id },
  });

  console.log(`Admin user created: ${resolvedEmail}`);
}

async function main() {
  const credentials = getAdminCredentials();
  await seedAdmin(credentials.email, credentials.password);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Admin seed failed:', error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
