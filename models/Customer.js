const pool = require('../db');

const getAllCustomers = async () => {
  const { rows } = await pool.query(`
    SELECT c.*, u.name as owner_name 
    FROM customers c 
    LEFT JOIN users u ON c.owner_id = u.id 
    ORDER BY c.created_at DESC
  `);
  return rows;
};

const getCustomersPaginated = async (limit, offset, search = '', status = '', sort = 'created_at', order = 'desc') => {
  let where = [];
  let params = [];
  let idx = 1;
  if (search) {
    where.push(`(c.name ILIKE $${idx} OR c.email ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (status) {
    where.push(`c.status = $${idx}`);
    params.push(status);
    idx++;
  }
  let whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  // Prevent SQL injection for sort/order
  const allowedSort = ['name', 'email', 'status', 'created_at'];
  const allowedOrder = ['asc', 'desc'];
  const sortCol = allowedSort.includes(sort) ? sort : 'created_at';
  const sortOrder = allowedOrder.includes(order.toLowerCase()) ? order : 'desc';
  params.push(limit, offset);
  const { rows } = await pool.query(`
    SELECT c.*, u.name as owner_name
    FROM customers c
    LEFT JOIN users u ON c.owner_id = u.id
    ${whereClause}
    ORDER BY c.${sortCol} ${sortOrder}
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);
  return rows;
};

const getCustomersCount = async (search = '', status = '') => {
  let where = [];
  let params = [];
  let idx = 1;
  if (search) {
    where.push(`(name ILIKE $${idx} OR email ILIKE $${idx} OR company ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (status) {
    where.push(`status = $${idx}`);
    params.push(status);
    idx++;
  }
  let whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sql = `SELECT COUNT(*) as count FROM customers ${whereClause}`;
  try {
    console.log('[CUSTOMER COUNT SQL]', sql, params);
    const { rows } = await pool.query(sql, params);
    console.log('[CUSTOMER COUNT rows]', rows);
    console.log('[CUSTOMER COUNT rows[0]]', rows[0]);
    console.log('[CUSTOMER COUNT rows[0].count]', rows[0].count);
    const count = parseInt(rows[0].count, 10);
    if (isNaN(count)) {
      console.error('[CUSTOMER COUNT ERROR] count is not a number:', rows[0].count);
      return 0;
    }
    return count;
  } catch (err) {
    console.error('[CUSTOMER COUNT ERROR]', err);
    throw err;
  }
};

const getCustomerById = async (id) => {
  const { rows } = await pool.query(`
    SELECT c.*, u.name as owner_name 
    FROM customers c 
    LEFT JOIN users u ON c.owner_id = u.id 
    WHERE c.id = $1
  `, [id]);
  return rows[0];
};

const createCustomer = async (customerData) => {
  const { 
    name, 
    email, 
    phone, 
    company, 
    status = 'lead', 
    owner_id = null,
    notes = ''
  } = customerData;
  try {
    const { rows } = await pool.query(
      'INSERT INTO customers (name, email, phone, company, status, owner_id, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [name, email, phone, company, status, owner_id, notes]
    );
    return { id: rows[0].id };
  } catch (err) {
    console.error('[CREATE CUSTOMER ERROR]', err.message, { name, email, phone, company, status, owner_id, notes });
    throw err;
  }
};

const updateCustomer = async (id, customerData) => {
  const { 
    name, 
    email, 
    phone, 
    company, 
    status, 
    owner_id,
    notes 
  } = customerData;
  const { rowCount } = await pool.query(
    'UPDATE customers SET name = $1, email = $2, phone = $3, company = $4, status = $5, owner_id = $6, notes = $7 WHERE id = $8',
    [name, email, phone, company, status, owner_id, notes, id]
  );
  return { rowCount };
};

const deleteCustomer = async (id) => {
  const { rowCount } = await pool.query('DELETE FROM customers WHERE id = $1', [id]);
  return { rowCount };
};

module.exports = {
  getAllCustomers,
  getCustomersPaginated,
  getCustomersCount,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer
}; 