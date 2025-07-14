const pool = require('../db');
const bcrypt = require('bcryptjs');

const createUser = async (name, email, password, role = 'sales') => {
  // Always hash the password if it's not already hashed
  const isHashed = typeof password === 'string' && (password.startsWith('$2a$') || password.startsWith('$2b$'));
  const hashedPassword = isHashed ? password : await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [name, email, hashedPassword, role]
  );
  return { id: rows[0].id };
};

const findUserByEmail = async (email) => {
  const { rows } = await pool.query(
    'SELECT id, name, email, password, role FROM users WHERE email = $1',
    [email]
  );
  return rows[0];
};

const findUserById = async (id) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0];
};

const getAllUsers = async () => {
  const { rows } = await pool.query('SELECT id, name, email, role, created_at FROM users');
  return rows;
};

const updateUser = async (id, userData) => {
  const { name, email, role } = userData;
  const { rowCount } = await pool.query(
    'UPDATE users SET name = $1, email = $2, role = $3 WHERE id = $4',
    [name, email, role, id]
  );
  return { rowCount };
};

const deleteUser = async (id) => {
  const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
  return { rowCount };
};

module.exports = { 
  createUser, 
  findUserByEmail, 
  findUserById,
  getAllUsers,
  updateUser,
  deleteUser
}; 