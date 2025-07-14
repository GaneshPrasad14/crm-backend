const pool = require('../db');

const getAllDeals = async () => {
  const { rows } = await pool.query(`
    SELECT d.*, c.name as customer_name, u.name as owner_name
    FROM deals d 
    LEFT JOIN customers c ON d.customer_id = c.id 
    LEFT JOIN users u ON d.owner_id = u.id
    ORDER BY d.created_at DESC
  `);
  return rows.map(row => ({ ...row, amount: row.amount !== null ? Number(row.amount) : 0 }));
};

const getDealsPaginated = async (limit, offset, search = '', stage = '', sort = 'created_at', order = 'desc') => {
  let where = [];
  let params = [];
  let idx = 1;
  if (search) {
    where.push(`(d.title ILIKE $${idx} OR d.description ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (stage && stage !== 'all') {
    where.push(`d.stage = $${idx}`);
    params.push(stage);
    idx++;
  }
  let whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  // Prevent SQL injection for sort/order
  const allowedSort = ['title', 'stage', 'value', 'created_at'];
  const allowedOrder = ['asc', 'desc'];
  const sortCol = allowedSort.includes(sort) ? sort : 'created_at';
  const sortOrder = allowedOrder.includes(order.toLowerCase()) ? order : 'desc';
  params.push(limit, offset);
  const { rows } = await pool.query(`
    SELECT d.*, c.name as customer_name, u.name as owner_name
    FROM deals d 
    LEFT JOIN customers c ON d.customer_id = c.id 
    LEFT JOIN users u ON d.owner_id = u.id
    ${whereClause}
    ORDER BY d.${sortCol} ${sortOrder}
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);
  return rows.map(row => ({ ...row, amount: row.amount !== null ? Number(row.amount) : 0 }));
};

const getDealsCount = async () => {
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM deals');
  console.log('[DEAL COUNT rows]', rows);
  return parseInt(rows[0].count, 10);
};

const getDealById = async (id) => {
  const { rows } = await pool.query(`
    SELECT d.*, c.name as customer_name, u.name as owner_name
    FROM deals d 
    LEFT JOIN customers c ON d.customer_id = c.id 
    LEFT JOIN users u ON d.owner_id = u.id
    WHERE d.id = $1
  `, [id]);
  const row = rows[0];
  if (!row) return undefined;
  return { ...row, amount: row.amount !== null ? Number(row.amount) : 0 };
};

const createDeal = async (dealData) => {
  const { 
    title, 
    description, 
    amount, 
    stage = 'prospecting', 
    customer_id,
    owner_id = null,
    expected_close_date = null
  } = dealData;
  const { rows } = await pool.query(
    'INSERT INTO deals (title, description, amount, stage, customer_id, owner_id, expected_close_date) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [title, description, amount, stage, customer_id, owner_id, expected_close_date]
  );
  return { id: rows[0].id };
};

const updateDeal = async (id, dealData) => {
  const { 
    title, 
    description, 
    amount, 
    stage, 
    customer_id,
    owner_id,
    expected_close_date
  } = dealData;
  const { rowCount } = await pool.query(
    'UPDATE deals SET title = $1, description = $2, amount = $3, stage = $4, customer_id = $5, owner_id = $6, expected_close_date = $7 WHERE id = $8',
    [title, description, amount, stage, customer_id, owner_id, expected_close_date, id]
  );
  return { rowCount };
};

const deleteDeal = async (id) => {
  const { rowCount } = await pool.query('DELETE FROM deals WHERE id = $1', [id]);
  return { rowCount };
};

module.exports = {
  getAllDeals,
  getDealsPaginated,
  getDealsCount,
  getDealById,
  createDeal,
  updateDeal,
  deleteDeal
}; 