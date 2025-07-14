const pool = require('../db');

// Get all attachments for a specific task
const getAttachmentsByTaskId = async (taskId) => {
  const { rows } = await pool.query(
    'SELECT * FROM attachments WHERE task_id = $1 ORDER BY created_at DESC',
    [taskId]
  );
  return rows;
};

// Create a new attachment
const createAttachment = async ({ task_id, file_name, file_url, file_type, company_name, description }) => {
  const { rows } = await pool.query(
    `INSERT INTO attachments 
     (task_id, file_name, file_url, file_type, company_name, description) 
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [task_id, file_name, file_url, file_type, company_name, description]
  );
  return rows[0];
};

// Delete attachment by ID
const deleteAttachment = async (id) => {
  const { rowCount } = await pool.query('DELETE FROM attachments WHERE id = $1', [id]);
  return { rowCount };
};

module.exports = {
  getAttachmentsByTaskId,
  createAttachment,
  deleteAttachment
};
