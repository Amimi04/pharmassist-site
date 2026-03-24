const { query } = require('../config/database');

const PLANS = {
  guest:        { label: 'Invité',         daily_limit: 2,  price: 0 },
  gratuit:      { label: 'Gratuit',        daily_limit: 5,  price: 0 },
  bienvenue:    { label: 'Bienvenue',      daily_limit: 20, price: 9.99 },
  professionnel:{ label: 'Professionnel',  daily_limit: -1, price: 29.99 }
};

class Subscription {
  static getPlans() { return PLANS; }

  static async getByUserId(userId) {
    const rows = await query(
      'SELECT * FROM subscriptions WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  }

  static async upgrade(userId, plan) {
    const planData = PLANS[plan];
    if (!planData) throw new Error('Plan invalide');
    
    // Deactivate current
    await query('UPDATE subscriptions SET is_active = 0 WHERE user_id = ?', [userId]);
    
    // Create new
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);
    
    const result = await query(
      'INSERT INTO subscriptions (user_id, plan, daily_limit, start_date, end_date, is_active) VALUES (?, ?, ?, CURDATE(), ?, 1)',
      [userId, plan, planData.daily_limit, endDate.toISOString().split('T')[0]]
    );
    return result.insertId;
  }

  static async checkDailyLimit(userId, sessionId) {
    // Get current subscription
    let dailyLimit = PLANS.guest.daily_limit; // default guest
    
    if (userId) {
      const sub = await this.getByUserId(userId);
      if (sub) {
        dailyLimit = sub.daily_limit;
        if (dailyLimit === -1) return { allowed: true, remaining: Infinity }; // unlimited
      }
    }
    
    // Count today's usage
    let usage;
    if (userId) {
      const rows = await query(
        'SELECT question_count FROM daily_usage WHERE user_id = ? AND usage_date = CURDATE()',
        [userId]
      );
      usage = rows[0]?.question_count || 0;
    } else {
      const rows = await query(
        'SELECT question_count FROM daily_usage WHERE session_id = ? AND usage_date = CURDATE()',
        [sessionId]
      );
      usage = rows[0]?.question_count || 0;
    }

    const remaining = dailyLimit - usage;
    return { allowed: remaining > 0, remaining, dailyLimit, used: usage };
  }

  static async incrementUsage(userId, sessionId) {
    if (userId) {
      await query(
        `INSERT INTO daily_usage (user_id, usage_date, question_count) VALUES (?, CURDATE(), 1)
         ON DUPLICATE KEY UPDATE question_count = question_count + 1`,
        [userId]
      );
    } else {
      await query(
        `INSERT INTO daily_usage (session_id, usage_date, question_count) VALUES (?, CURDATE(), 1)
         ON DUPLICATE KEY UPDATE question_count = question_count + 1`,
        [sessionId]
      );
    }
  }

  static async getStats() {
    const rows = await query(
      `SELECT plan, COUNT(*) as count FROM subscriptions WHERE is_active = 1 GROUP BY plan`
    );
    return rows;
  }
}

module.exports = { Subscription, PLANS };

