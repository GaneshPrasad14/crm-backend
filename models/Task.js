const pool = require('../db');

const getAllTasks = async () => {
  const { rows } = await pool.query(`
    SELECT t.*, u.name as owner_name, c.name as customer_name
    FROM tasks t 
    LEFT JOIN users u ON t.owner_id = u.id 
    LEFT JOIN customers c ON t.customer_id = c.id
    ORDER BY t.due_date ASC, t.created_at DESC
  `);
  return rows;
};

const getTasksPaginated = async (limit, offset, search = '', status = '', sort = 'due_date', order = 'asc') => {
  let where = [];
  let params = [];
  let idx = 1;
  if (search) {
    where.push(`(t.title ILIKE $${idx} OR t.description ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (status && status !== 'all') {
    where.push(`t.status = $${idx}`);
    params.push(status);
    idx++;
  }
  let whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  // Prevent SQL injection for sort/order
  const allowedSort = ['title', 'status', 'due_date', 'created_at'];
  const allowedOrder = ['asc', 'desc'];
  const sortCol = allowedSort.includes(sort) ? sort : 'due_date';
  const sortOrder = allowedOrder.includes(order.toLowerCase()) ? order : 'asc';
  params.push(limit, offset);
  const { rows } = await pool.query(`
    SELECT t.*, u.name as owner_name, c.name as customer_name
    FROM tasks t 
    LEFT JOIN users u ON t.owner_id = u.id 
    LEFT JOIN customers c ON t.customer_id = c.id
    ${whereClause}
    ORDER BY t.${sortCol} ${sortOrder}
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);
  return rows;
};

const getTasksCount = async (search = '', status = '') => {
  let where = [];
  let params = [];
  let idx = 1;
  if (search) {
    where.push(`(title ILIKE $${idx} OR description ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (status && status !== 'all') {
    where.push(`status = $${idx}`);
    params.push(status);
    idx++;
  }
  let whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const { rows } = await pool.query(`SELECT COUNT(*) as count FROM tasks ${whereClause}`, params);
  console.log('[TASK COUNT rows]', rows);
  return parseInt(rows[0].count, 10);
};

const getTaskById = async (id) => {
  const { rows } = await pool.query(`
    SELECT t.*, u.name as owner_name, c.name as customer_name
    FROM tasks t 
    LEFT JOIN users u ON t.owner_id = u.id 
    LEFT JOIN customers c ON t.customer_id = c.id
    WHERE t.id = $1
  `, [id]);
  return rows[0];
};

const createTask = async (taskData) => {
  const { 
    title, 
    description, 
    due_date, 
    priority = 'medium', 
    status = 'pending',
    owner_id = null,
    customer_id = null
  } = taskData;
  const { rows } = await pool.query(
    'INSERT INTO tasks (title, description, due_date, priority, status, owner_id, customer_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [title, description, due_date, priority, status, owner_id, customer_id]
  );
  return { id: rows[0].id };
};

const updateTask = async (id, taskData) => {
  const { 
    title, 
    description, 
    due_date, 
    priority, 
    status,
    owner_id,
    customer_id
  } = taskData;
  const { rowCount } = await pool.query(
    'UPDATE tasks SET title = $1, description = $2, due_date = $3, priority = $4, status = $5, owner_id = $6, customer_id = $7 WHERE id = $8',
    [title, description, due_date, priority, status, owner_id, customer_id, id]
  );
  return { rowCount };
};

const deleteTask = async (id) => {
  const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  return { rowCount };
};

module.exports = {
  getAllTasks,
  getTasksPaginated,
  getTasksCount,
  getTaskById,
  createTask,
  updateTask,
  deleteTask
}; 