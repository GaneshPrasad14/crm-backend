const pool = require('../db');

const getAllNotifications = async (userId) => {
  const { rows } = await pool.query(`
    SELECT n.*, u.name as created_by_name
    FROM notifications n 
    LEFT JOIN users u ON n.created_by = u.id
    WHERE n.user_id = $1
    ORDER BY n.created_at DESC
  `, [userId]);
  return rows;
};

const getNotificationById = async (id) => {
  const { rows } = await pool.query(`
    SELECT n.*, u.name as created_by_name
    FROM notifications n 
    LEFT JOIN users u ON n.created_by = u.id
    WHERE n.id = $1
  `, [id]);
  return rows[0];
};

const createNotification = async (notificationData) => {
  const { 
    user_id, 
    title, 
    message, 
    type = 'info',
    is_read = false,
    created_by = null
  } = notificationData;
  const { rows } = await pool.query(
    'INSERT INTO notifications (user_id, title, message, type, is_read, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [user_id, title, message, type, is_read, created_by]
  );
  return { id: rows[0].id };
};

const markAsRead = async (id) => {
  const { rowCount } = await pool.query(
    'UPDATE notifications SET is_read = true WHERE id = $1',
    [id]
  );
  return { rowCount };
};

const deleteNotification = async (id) => {
  const { rowCount } = await pool.query('DELETE FROM notifications WHERE id = $1', [id]);
  return { rowCount };
};

module.exports = {
  getAllNotifications,
  getNotificationById,
  createNotification,
  markAsRead,
  deleteNotification
}; 