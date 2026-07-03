import { execSync } from 'node:child_process';

async function run() {
  console.log('Seeding node...');
  execSync('npx ts-node src/seed/seed-node.ts', { stdio: 'inherit', cwd: __dirname + '/../..' });

  console.log('Seeding admin...');
  const emailArg = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL : '';
  const passArg = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD : '';
  execSync(`npx ts-node src/seed/seed-admin.ts ${emailArg} ${passArg}`, { stdio: 'inherit', cwd: __dirname + '/../..' });

  console.log('Seed complete.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
