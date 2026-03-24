const User = require('../models/User');
const { Subscription } = require('../models/Subscription');
const Payment = require('../models/Payment');
const pharma = require('../services/pharmaSearchService');
const { query } = require('../config/database');

exports.dashboard = async (req, res) => {
  try {
    const [userCount] = await query('SELECT COUNT(*) as cnt FROM users');
    const [msgCount] = await query('SELECT COUNT(*) as cnt FROM chat_messages');
    const [payCount] = await query("SELECT COUNT(*) as cnt, SUM(amount) as total FROM payments WHERE status = 'completed'");
    const subStats = await Subscription.getStats();
    const pharmaStats = await pharma.getStats();
    const recentPayments = (await Payment.getAll({ limit: 5 })).rows;
    const recentUsers = (await User.getAll({ limit: 5 })).rows;

    res.render('admin/dashboard', {
      title: 'Dashboard - Administration PharmaBot',
      user: req.session?.user,
      stats: {
        users: userCount.cnt,
        messages: msgCount.cnt,
        revenue: payCount.total || 0,
        payments: payCount.cnt,
        pharma: pharmaStats,
        subscriptions: subStats
      },
      recentPayments,
      recentUsers
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.render('error', { title: 'Erreur', message: err.message, user: req.session?.user });
  }
};

exports.users = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  try {
    const { rows, total } = await User.getAll({ page, limit: 20 });
    res.render('admin/users', {
      title: 'Utilisateurs - Administration',
      users: rows,
      total,
      page,
      pages: Math.ceil(total / 20),
      user: req.session?.user,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
};

exports.updateUserRole = async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  try {
    await User.updateRole(id, role);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    await User.delete(id);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
};

exports.payments = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  try {
    const { rows, total } = await Payment.getAll({ page, limit: 20 });
    const revenue = await Payment.getRevenue();
    res.render('admin/payments', {
      title: 'Paiements - Administration',
      payments: rows,
      total,
      page,
      pages: Math.ceil(total / 20),
      revenue,
      user: req.session?.user
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
};

exports.medicines = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const search = req.query.search || '';
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    let rows, total;
    if (search) {
      rows = await query(
        `SELECT mp.*, ir.firnm as indication, hyr.ti as categorie
         FROM mp LEFT JOIN ir ON ir.ircv = mp.ircv LEFT JOIN hyr ON hyr.hyrcv = mp.hyrcv
         WHERE mp.mpnm LIKE ? ORDER BY mp.mpnm LIMIT ? OFFSET ?`,
        [`%${search}%`, limit, offset]
      );
      const [cnt] = await query('SELECT COUNT(*) as cnt FROM mp WHERE mpnm LIKE ?', [`%${search}%`]);
      total = cnt.cnt;
    } else {
      rows = await query(
        `SELECT mp.*, ir.firnm as indication, hyr.ti as categorie
         FROM mp LEFT JOIN ir ON ir.ircv = mp.ircv LEFT JOIN hyr ON hyr.hyrcv = mp.hyrcv
         ORDER BY mp.mpnm LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      const [cnt] = await query('SELECT COUNT(*) as cnt FROM mp');
      total = cnt.cnt;
    }

    res.render('admin/medicines', {
      title: 'Médicaments - Administration',
      medicines: rows,
      total,
      page,
      pages: Math.ceil(total / limit),
      search,
      user: req.session?.user,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
};

exports.substances = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const search = req.query.search || '';
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const like = `%${search}%`;
    const rows = await query(
      `SELECT * FROM innm WHERE finnm LIKE ? OR ninnm LIKE ? ORDER BY finnm LIMIT ? OFFSET ?`,
      [like, like, limit, offset]
    );
    const [cnt] = await query('SELECT COUNT(*) as cnt FROM innm WHERE finnm LIKE ? OR ninnm LIKE ?', [like, like]);

    res.render('admin/substances', {
      title: 'Substances - Administration',
      substances: rows,
      total: cnt.cnt,
      page,
      pages: Math.ceil(cnt.cnt / limit),
      search,
      user: req.session?.user
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
};

exports.galenic = async (req, res) => {
  try {
    const rows = await query('SELECT * FROM gal ORDER BY fgalnm');
    res.render('admin/galenic', {
      title: 'Formes galéniques - Administration',
      forms: rows,
      user: req.session?.user
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
};

exports.indications = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 30;
  const offset = (page - 1) * limit;
  try {
    const rows = await query('SELECT * FROM ir ORDER BY firnm LIMIT ? OFFSET ?', [limit, offset]);
    const [cnt] = await query('SELECT COUNT(*) as cnt FROM ir');
    res.render('admin/indications', {
      title: 'Indications - Administration',
      indications: rows,
      total: cnt.cnt,
      page,
      pages: Math.ceil(cnt.cnt / limit),
      user: req.session?.user
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
};

exports.messages = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 30;
  const offset = (page - 1) * limit;
  try {
    const rows = await query(
      `SELECT cm.*, u.fullname, u.email 
       FROM chat_messages cm 
       LEFT JOIN users u ON u.id = cm.user_id 
       ORDER BY cm.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const [cnt] = await query('SELECT COUNT(*) as cnt FROM chat_messages');
    res.render('admin/messages', {
      title: 'Messages - Administration',
      messages: rows,
      total: cnt.cnt,
      page,
      pages: Math.ceil(cnt.cnt / limit),
      user: req.session?.user
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
};

