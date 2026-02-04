import pg from 'pg';
import bcrypt from 'bcrypt';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function updateDemoPassword() {
  const password = 'Demo123!';
  const hash = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      `UPDATE users SET password_hash = $1 WHERE email = 'demo@borrowhood.com' RETURNING id, email`,
      [hash]
    );

    if (result.rows.length > 0) {
      console.log('Updated password for:', result.rows[0].email);
    } else {
      console.log('User not found, creating...');
      await pool.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, status, city, state)
         VALUES (gen_random_uuid(), 'demo@borrowhood.com', $1, 'Demo', 'User', 'active', 'San Francisco', 'CA')`,
        [hash]
      );
      console.log('Created demo user');
    }
    console.log('Email: demo@borrowhood.com');
    console.log('Password: Demo123!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

updateDemoPassword();
