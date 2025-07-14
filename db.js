const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// PostgreSQL connection string
const connectionString = process.env.PG_CONNECTION_STRING || 'postgresql://neondb_owner:npg_sGxhjd7gJT8n@ep-black-snow-a1mhkj3a-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('PostgreSQL connection failed:', err);
    return;
  }
  console.log('PostgreSQL connected successfully!');
  release();
});

module.exports = pool; 