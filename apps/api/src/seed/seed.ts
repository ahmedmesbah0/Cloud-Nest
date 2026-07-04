import { execSync } from 'node:child_process';

async function run() {
  console.log('Seeding node...');
  execSync('npx ts-node src/seed/seed-node.ts', { stdio: 'inherit', cwd: __dirname + '/../..' });

  console.log('No admin seed needed — first user registration becomes admin');

  console.log('Seeding templates...');
  execSync('npx ts-node src/seed/seed-template.ts', { stdio: 'inherit', cwd: __dirname + '/../..' });

  console.log('Seed complete.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
