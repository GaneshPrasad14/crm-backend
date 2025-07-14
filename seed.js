require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

// Debug: Check if environment variables are loaded
console.log('MYSQL_HOST:', process.env.MYSQL_HOST);
console.log('MYSQL_USER:', process.env.MYSQL_USER);
console.log('MYSQL_DATABASE:', process.env.MYSQL_DATABASE);
console.log('MYSQL_PASSWORD:', process.env.MYSQL_PASSWORD ? '***SET***' : '***NOT SET***');

async function seedData(adminId, salesId) {
  // Check if data already exists
  const { rows: existingCustomers } = await pool.query('SELECT COUNT(*) as count FROM customers');
  const { rows: existingTasks } = await pool.query('SELECT COUNT(*) as count FROM tasks');
  const { rows: existingDeals } = await pool.query('SELECT COUNT(*) as count FROM deals');
  const { rows: existingInvoices } = await pool.query('SELECT COUNT(*) as count FROM invoices');
  const { rows: existingNotifications } = await pool.query('SELECT COUNT(*) as count FROM notifications');
  
  if (parseInt(existingCustomers[0].count) > 0) {
    console.log('Sample data already exists, skipping...');
    return;
  }
  
  console.log('Creating sample data...');
  
  // Create a customer
  await pool.query(
    'INSERT INTO customers (name, email, phone, company, status, owner_id) VALUES ($1, $2, $3, $4, $5, $6)',
    ['Acme Corp', 'contact@acme.com', '1234567890', 'Acme', 'lead', salesId]
  );

  // Get customer ID
  const { rows: customers } = await pool.query('SELECT id FROM customers');
  const customerId = customers[0].id;

  // Create a task
  await pool.query(
    'INSERT INTO tasks (title, description, due_date, status, assigned_to, customer_id) VALUES ($1, $2, $3, $4, $5, $6)',
    ['Call client', 'Discuss requirements', '2024-06-30', 'pending', salesId, customerId]
  );

  // Create a deal
  await pool.query(
    'INSERT INTO deals (title, amount, stage, customer_id, owner_id) VALUES ($1, $2, $3, $4, $5)',
    ['Big Sale', 10000, 'lead', customerId, salesId]
  );

  // Get deal ID
  const { rows: deals } = await pool.query('SELECT id FROM deals');
  const dealId = deals[0].id;

  // Create an invoice
  await pool.query(
    'INSERT INTO invoices (deal_id, customer_id, amount, status, issued_date, due_date) VALUES ($1, $2, $3, $4, $5, $6)',
    [dealId, customerId, 10000, 'draft', '2024-06-01', '2024-06-15']
  );

  // Create a notification
  await pool.query(
    'INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)',
    [salesId, 'You have a new task!', 'task']
  );
}

async function seed() {
  try {
    // Test database connection first
    console.log('Testing database connection...');
    await pool.query('SELECT 1');
    console.log('Database connection successful!');
    
    // Check if tables exist
    console.log('Checking if tables exist...');
    const { rows: tables } = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('Existing tables:', tables.map(t => t.table_name));
    
    // Check if users already exist
    const { rows: existingUsers } = await pool.query('SELECT COUNT(*) as count FROM users');
    if (parseInt(existingUsers[0].count) > 0) {
      console.log('Users already exist, skipping user creation...');
      const { rows: users } = await pool.query('SELECT id, role FROM users');
      const adminUser = users.find(u => u.role === 'admin');
      const salesUser = users.find(u => u.role === 'sales');
      
      if (adminUser && salesUser) {
        console.log('Using existing users...');
        const adminId = adminUser.id;
        const salesId = salesUser.id;
        
        // Continue with rest of seeding...
        await seedData(adminId, salesId);
        return;
      }
    }
    
    // Create users
    const adminPassword = await bcrypt.hash('adminpass', 10);
    const salesPassword = await bcrypt.hash('salespass', 10);

    await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
      ['Admin User', 'admin@example.com', adminPassword, 'admin']
    );
    await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
      ['Sales User', 'sales@example.com', salesPassword, 'sales']
    );

    // Get user IDs
    const { rows: users } = await pool.query('SELECT id FROM users');
    const adminId = users[0].id;
    const salesId = users[1].id;

    // Seed the rest of the data
    await seedData(adminId, salesId);

    console.log('Seeding complete!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err.message);
    console.error('Full error:', err);
    process.exit(1);
  }
}

seed(); 