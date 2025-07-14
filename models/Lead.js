const pool = require('../db');

// Create a new lead
const createLead = async (lead) => {
  const { name, email, phone, company, status = 'new', assigned_to, created_by, notes } = lead;
  const { rows } = await pool.query(
    `INSERT INTO leads (name, email, phone, company, status, assigned_to, created_by, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [name, email, phone, company, status, assigned_to, created_by, notes]
  );
  return rows[0];
};

// Get all leads (admin) or assigned leads (member)
const getLeads = async (user) => {
  if (user.role === 'admin') {
    const { rows } = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');
    return rows;
  } else {
    const { rows } = await pool.query('SELECT * FROM leads WHERE assigned_to = $1 ORDER BY created_at DESC', [user.id]);
    return rows;
  }
};

// Get a single lead by ID
const getLeadById = async (id) => {
  const { rows } = await pool.query('SELECT * FROM leads WHERE id = $1', [id]);
  return rows[0];
};

// Update a lead
const updateLead = async (id, lead) => {
  const { name, email, phone, company, status, assigned_to, notes } = lead;
  const { rowCount } = await pool.query(
    `UPDATE leads SET name = $1, email = $2, phone = $3, company = $4, status = $5, assigned_to = $6, notes = $7, updated_at = NOW() WHERE id = $8`,
    [name, email, phone, company, status, assigned_to, notes, id]
  );
  return { rowCount };
};

// Delete a lead
const deleteLead = async (id) => {
  const { rowCount } = await pool.query('DELETE FROM leads WHERE id = $1', [id]);
  return { rowCount };
};

// Assign a lead to a user
const assignLeadToUser = async (leadId, userId) => {
  const { rowCount } = await pool.query('UPDATE leads SET assigned_to = $1, updated_at = NOW() WHERE id = $2', [userId, leadId]);
  return { rowCount };
};

module.exports = {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  assignLeadToUser
}; 