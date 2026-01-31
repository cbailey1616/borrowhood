// Database connection test script
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/borrowhood',
});

async function testDatabase() {
  console.log('Testing database connection...\n');

  try {
    // Test connection
    const client = await pool.connect();
    console.log('✓ Connected to PostgreSQL\n');

    // List all tables
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('Tables created:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    // Check seed data
    console.log('\nSeed data:');

    const community = await client.query('SELECT * FROM communities LIMIT 1');
    if (community.rows.length > 0) {
      console.log(`  ✓ Community: ${community.rows[0].name} (${community.rows[0].city}, ${community.rows[0].state})`);
    }

    const category = await client.query('SELECT COUNT(*) as count FROM categories');
    console.log(`  ✓ Categories: ${category.rows[0].count}`);

    // Test some enum types
    const enums = await client.query(`
      SELECT typname FROM pg_type
      WHERE typtype = 'e'
      ORDER BY typname
    `);
    console.log('\nEnum types:');
    enums.rows.forEach(row => {
      console.log(`  - ${row.typname}`);
    });

    // Check indexes
    const indexes = await client.query(`
      SELECT COUNT(*) as count FROM pg_indexes WHERE schemaname = 'public'
    `);
    console.log(`\nIndexes created: ${indexes.rows[0].count}`);

    // Check triggers
    const triggers = await client.query(`
      SELECT COUNT(*) as count FROM information_schema.triggers WHERE trigger_schema = 'public'
    `);
    console.log(`Triggers created: ${triggers.rows[0].count}`);

    client.release();
    console.log('\n✓ All database tests passed!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Database test failed:', error.message);
    console.error('\nMake sure PostgreSQL is running and the database exists.');
    console.error('Run: createdb borrowhood');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testDatabase();
