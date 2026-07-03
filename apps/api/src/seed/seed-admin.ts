import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
const prisma = new PrismaClient();

export async function seedAdmin() {
  const email = 'admin@cloudnest.io';
  const password = 'AdminP4ss!';

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log('Admin user already exists');
    return;
  }

  const passwordHash = await argon2.hash(password);

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
      email,
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

  console.log(`Admin user created: ${email} / ${password}`);
}

seedAdmin()
  .catch((e) => {
    console.error('Admin seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
