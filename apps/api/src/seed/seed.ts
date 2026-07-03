import { execSync } from 'node:child_process';

async function run() {
  console.log('Seeding node...');
  execSync('npx ts-node src/seed/seed-node.ts', { stdio: 'inherit', cwd: __dirname + '/../..' });

  console.log('Seeding admin...');
  execSync('npx ts-node src/seed/seed-admin.ts', { stdio: 'inherit', cwd: __dirname + '/../..' });

  console.log('Seed complete.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
