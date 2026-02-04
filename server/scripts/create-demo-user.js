import { query, pool } from '../src/utils/db.js';
import bcrypt from 'bcrypt';

async function createDemoUser() {
  const email = 'demo@borrowhood.com';
  const password = 'Demo123!';
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    // Check if user exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);

    if (existing.rows.length > 0) {
      console.log('Demo user already exists:', email);
    } else {
      const result = await query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, status, city, state)
         VALUES (gen_random_uuid(), $1, $2, 'Demo', 'User', 'active', 'San Francisco', 'CA')
         RETURNING id, email`,
        [email, passwordHash]
      );
      console.log('Created demo user:', result.rows[0]);
    }

    console.log('\nDemo credentials:');
    console.log('Email:', email);
    console.log('Password:', password);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

createDemoUser();
