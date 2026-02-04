#!/bin/sh

# Run demo user migration if it exists
if [ -f "migrations/004_demo_user.sql" ]; then
  echo "Running demo user migration..."
  node -e "
    const { Pool } = require('pg');
    const fs = require('fs');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const sql = fs.readFileSync('migrations/004_demo_user.sql', 'utf8');
    pool.query(sql)
      .then(() => { console.log('Demo user migration complete'); pool.end(); })
      .catch(e => { console.error('Migration error:', e.message); pool.end(); });
  "
fi

# Start the server
exec node src/index.js
