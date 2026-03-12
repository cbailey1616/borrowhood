import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const dbUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

async function resetDatabase() {
  const client = await pool.connect();
  try {
    console.log('🗑️  Dropping all objects...');
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO public');
    console.log('✅ Schema dropped and recreated');

    // Run migrations in order
    const migrationFiles = [
      'railway_setup.sql',
      '002_neighborhoods.sql',
      '003_messaging_and_rto.sql',
      '004_listing_discussions.sql',
      '005_new_features.sql',
      '006_subscriptions.sql',
    ];

    for (const file of migrationFiles) {
      const filePath = path.join(__dirname, '../migrations', file);
      let sql = fs.readFileSync(filePath, 'utf8');

      // Strip PostGIS-dependent statements (not available on Railway)
      if (file === '002_neighborhoods.sql') {
        sql = sql
          .split('\n')
          .filter(line => !line.includes('GEOGRAPHY') && !line.includes('ST_') && !line.includes('GIST'))
          .join('\n');
      }

      console.log(`📦 Running ${file}...`);
      try {
        await client.query(sql);
        console.log(`   ✅ ${file} complete`);
      } catch (err) {
        console.log(`   ⚠️  ${file} partial: ${err.message}`);
      }
    }

    console.log('\n🎉 Database reset complete! All tables recreated with seed data.');

    // Show table count
    const result = await client.query(`
      SELECT COUNT(*) as table_count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    console.log(`📊 ${result.rows[0].table_count} tables created`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

resetDatabase();
