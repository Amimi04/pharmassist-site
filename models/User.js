const { query } = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async findById(id) {
    const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async findByEmail(email) {
    const rows = await query('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0] || null;
  }

  static async create({ fullname, email, password, profession }) {
    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users (fullname, email, password, profession) VALUES (?, ?, ?, ?)',
      [fullname, email, hash, profession]
    );
    const userId = result.insertId;
    // Create free subscription by default
    await query(
      'INSERT INTO subscriptions (user_id, plan, daily_limit, start_date) VALUES (?, ?, ?, CURDATE())',
      [userId, 'gratuit', 5]
    );
    return userId;
  }

  static async verifyPassword(plain, hashed) {
    return bcrypt.compare(plain, hashed);
  }

  static async getAll({ page = 1, limit = 20 } = {}) {
    const limitInt = parseInt(limit, 10);
    const offsetInt = parseInt((page - 1) * limitInt, 10);
    const rows = await query(
      `SELECT u.*, s.plan, s.daily_limit
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id AND s.is_active = 1
       ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [limitInt, offsetInt]
    );
    const [{ total }] = await query('SELECT COUNT(*) as total FROM users');
    return { rows, total, page, limit };
  }

  static async updateRole(id, role) {
    return query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  }

  static async delete(id) {
    return query('DELETE FROM users WHERE id = ?', [id]);
  }

  static async getWithSubscription(userId) {
    const rows = await query(
      `SELECT u.*, s.plan, s.daily_limit, s.end_date
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id AND s.is_active = 1
       WHERE u.id = ?`,
      [userId]
    );
    return rows[0] || null;
  }
}

module.exports = User;

