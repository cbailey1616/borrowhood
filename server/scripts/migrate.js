import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../src/utils/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'migrations');

async function runMigrations() {
  console.log('Running migrations...');

  // Get all migration files sorted
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    console.log(`Running: ${file}`);
    try {
      await pool.query(sql);
      console.log(`  ✓ Success`);
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        console.log(`  ⊘ Already applied (skipped)`);
      } else {
        console.error(`  ✗ Error:`, err.message);
      }
    }
  }

  console.log('\nMigrations complete!');
  await pool.end();
}

runMigrations().catch(console.error);
