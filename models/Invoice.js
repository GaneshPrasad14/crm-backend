const pool = require('../db');

const getAllInvoices = async () => {
  const { rows } = await pool.query(`
    SELECT i.*, c.name as customer_name, u.name as created_by_name
    FROM invoices i 
    LEFT JOIN customers c ON i.customer_id = c.id 
    LEFT JOIN users u ON i.created_by = u.id
    ORDER BY i.created_at DESC
  `);
  return rows;
};

const getInvoiceById = async (id) => {
  const { rows } = await pool.query(`
    SELECT i.*, c.name as customer_name, u.name as created_by_name
    FROM invoices i 
    LEFT JOIN customers c ON i.customer_id = c.id 
    LEFT JOIN users u ON i.created_by = u.id
    WHERE i.id = $1
  `, [id]);
  return rows[0];
};

const createInvoice = async (invoiceData) => {
  const { 
    customer_id, 
    amount, 
    description, 
    due_date, 
    status = 'pending',
    created_by
  } = invoiceData;
  const { rows } = await pool.query(
    'INSERT INTO invoices (customer_id, amount, description, due_date, status, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [customer_id, amount, description, due_date, status, created_by]
  );
  return { id: rows[0].id };
};

const updateInvoice = async (id, invoiceData) => {
  const { 
    customer_id, 
    amount, 
    description, 
    due_date, 
    status,
    created_by
  } = invoiceData;
  const { rowCount } = await pool.query(
    'UPDATE invoices SET customer_id = $1, amount = $2, description = $3, due_date = $4, status = $5, created_by = $6 WHERE id = $7',
    [customer_id, amount, description, due_date, status, created_by, id]
  );
  return { rowCount };
};

const deleteInvoice = async (id) => {
  const { rowCount } = await pool.query('DELETE FROM invoices WHERE id = $1', [id]);
  return { rowCount };
};

module.exports = {
  getAllInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice
}; 