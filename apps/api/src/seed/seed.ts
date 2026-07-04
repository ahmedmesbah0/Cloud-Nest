import { execSync } from 'node:child_process';

async function run() {
  console.log('Seeding node...');
  execSync('npx ts-node src/seed/seed-node.ts', { stdio: 'inherit', cwd: __dirname + '/../..' });

  const adminEmail = process.env.ADMIN_EMAIL || '';
  const adminPass = process.env.ADMIN_PASSWORD || '';
  if (adminEmail && adminPass) {
    console.log('Seeding admin...');
    execSync(`npx ts-node src/seed/seed-admin.ts ${adminEmail} ${adminPass}`, { stdio: 'inherit', cwd: __dirname + '/../..' });
  } else {
    console.log('Skipping admin seed (ADMIN_EMAIL/ADMIN_PASSWORD not set) — first registration becomes admin');
  }

  console.log('Seeding templates...');
  execSync('npx ts-node src/seed/seed-template.ts', { stdio: 'inherit', cwd: __dirname + '/../..' });

  console.log('Seed complete.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
