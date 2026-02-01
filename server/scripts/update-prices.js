import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function updatePrices() {
  try {
    await pool.query(`UPDATE subscription_pricing SET price_cents = 100 WHERE tier = 'neighborhood'`);
    await pool.query(`UPDATE subscription_pricing SET price_cents = 200 WHERE tier = 'town'`);
    console.log('Prices updated successfully!');
    console.log('- Neighborhood: $1/mo');
    console.log('- Town: $2/mo');
  } catch (err) {
    console.error('Error updating prices:', err.message);
  } finally {
    await pool.end();
  }
}

updatePrices();
