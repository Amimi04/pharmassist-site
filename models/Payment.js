const { query } = require('../config/database');

class Payment {
  static async create({ userId, amount, currency = 'EUR', method, paymentIntentId, plan, status = 'pending' }) {
    const result = await query(
      `INSERT INTO payments (user_id, amount, currency, payment_method, payment_intent_id, plan, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, amount, currency, method, paymentIntentId, plan, status]
    );
    return result.insertId;
  }

  static async updateStatus(paymentIntentId, status, subscriptionId = null) {
    return query(
      'UPDATE payments SET status = ?, subscription_id = ? WHERE payment_intent_id = ?',
      [status, subscriptionId, paymentIntentId]
    );
  }

  static async getByUserId(userId) {
    return query(
      'SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
  }

  static async getAll({ page = 1, limit = 20 } = {}) {
    const limitInt = parseInt(limit, 10);
    const offsetInt = parseInt((page - 1) * limitInt, 10);
    const rows = await query(
      `SELECT p.*, u.fullname, u.email
       FROM payments p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      [limitInt, offsetInt]
    );
    const [{ total }] = await query('SELECT COUNT(*) as total FROM payments');
    return { rows, total };
  }

  static async getRevenue() {
    const rows = await query(
      `SELECT 
         SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as count,
         DATE_FORMAT(created_at, '%Y-%m') as month
       FROM payments 
       GROUP BY month 
       ORDER BY month DESC 
       LIMIT 12`
    );
    return rows;
  }
}

module.exports = Payment;

