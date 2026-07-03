import path from 'node:path';
import dotenv from 'dotenv';

export function loadAppEnv(envFilePath = path.resolve(process.cwd(), '.env')) {
  const result = dotenv.config({ path: envFilePath });

  if (result.error) {
    if (result.error.message.includes('ENOENT')) {
      return result;
    }
    throw result.error;
  }

  return result;
}

export function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.DATABASE_URL?.trim() || '';
}
