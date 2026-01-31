// Start embedded PostgreSQL for development
import { PostgresInstance } from 'pg-embedded';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '.pg-data');

async function startPostgres() {
  console.log('Starting embedded PostgreSQL...');
  console.log('Data directory:', dataDir);
  console.log('');

  // Create data directory if needed
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const instance = new PostgresInstance({
    databaseDir: dataDir,
    port: 5432,
    user: 'postgres',
    password: 'postgres',
  });

  try {
    // Start PostgreSQL (this will download it if needed)
    console.log('Starting PostgreSQL (may download on first run)...');
    await instance.start();

    const connInfo = instance.connectionInfo();
    console.log('PostgreSQL started!');
    console.log(`  Host: ${connInfo.host}`);
    console.log(`  Port: ${connInfo.port}`);
    console.log(`  User: ${connInfo.user}`);
    console.log('');

    // Create the borrowhood database
    const adminPool = new pg.Pool({
      host: connInfo.host,
      port: connInfo.port,
      user: connInfo.user,
      password: connInfo.password,
      database: 'postgres',
    });

    try {
      await adminPool.query('CREATE DATABASE borrowhood');
      console.log('Created database: borrowhood');
    } catch (e) {
      if (e.code === '42P04') {
        console.log('Database borrowhood already exists');
      } else {
        throw e;
      }
    }
    await adminPool.end();

    // Run migrations
    console.log('\nRunning migrations...');
    const migrationPath = path.join(__dirname, '..', 'migrations', '001_initial_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    const appPool = new pg.Pool({
      host: connInfo.host,
      port: connInfo.port,
      user: connInfo.user,
      password: connInfo.password,
      database: 'borrowhood',
    });

    await appPool.query(migrationSQL);
    console.log('Migrations complete!');

    // Verify tables
    const tables = await appPool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log(`\nTables created: ${tables.rows.length}`);
    tables.rows.forEach(r => console.log(`  - ${r.table_name}`));

    // Check seed data
    const community = await appPool.query('SELECT name, city, state FROM communities LIMIT 1');
    if (community.rows.length > 0) {
      const c = community.rows[0];
      console.log(`\nSeed data loaded:`);
      console.log(`  Community: ${c.name} (${c.city}, ${c.state})`);
    }

    await appPool.end();

    console.log('\n========================================');
    console.log('PostgreSQL is running!');
    console.log('========================================');
    console.log(`Connection URL: postgres://${connInfo.user}:${connInfo.password}@${connInfo.host}:${connInfo.port}/borrowhood`);
    console.log('\nTo connect manually:');
    console.log(`  psql postgres://${connInfo.user}:${connInfo.password}@${connInfo.host}:${connInfo.port}/borrowhood`);
    console.log('\nPress Ctrl+C to stop');

    // Keep running
    await new Promise((resolve) => {
      process.on('SIGINT', async () => {
        console.log('\n\nStopping PostgreSQL...');
        await instance.stop();
        console.log('PostgreSQL stopped.');
        resolve();
      });
    });

  } catch (error) {
    console.error('Failed:', error);
    try { await instance.stop(); } catch {}
    process.exit(1);
  }
}

startPostgres();
