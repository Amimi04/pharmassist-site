const User = require('../models/User');
const { body, validationResult } = require('express-validator');

const registerValidation = [
  body('fullname').trim().notEmpty().withMessage('Le nom complet est requis').isLength({ min: 2, max: 100 }),
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').isLength({ min: 6 }).withMessage('Mot de passe minimum 6 caractères')
    .matches(/\d/).withMessage('Le mot de passe doit contenir au moins un chiffre'),
  body('profession').isIn(['medecin', 'veterinaire', 'pharmacien', 'autre']).withMessage('Profession invalide'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Mot de passe requis'),
];

exports.showRegister = (req, res) => {
  res.render('auth/register', {
    title: 'Inscription - PharmaBot',
    errors: [],
    values: {},
    csrfToken: req.csrfToken ? req.csrfToken() : ''
  });
};

exports.register = [
  ...registerValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('auth/register', {
        title: 'Inscription - PharmaBot',
        errors: errors.array(),
        values: req.body,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    }

    const { fullname, email, password, profession } = req.body;

    try {
      const existing = await User.findByEmail(email);
      if (existing) {
        return res.render('auth/register', {
          title: 'Inscription - PharmaBot',
          errors: [{ msg: 'Cet email est déjà utilisé.' }],
          values: req.body,
          csrfToken: req.csrfToken ? req.csrfToken() : ''
        });
      }

      const userId = await User.create({ fullname, email, password, profession });
      const user = await User.findById(userId);

      req.session.userId = userId;
      req.session.userRole = user.role;
      req.session.user = { id: userId, fullname: user.fullname, email: user.email, role: user.role };

      return res.redirect('/chat');
    } catch (err) {
      console.error('Erreur inscription:', err);
      return res.render('auth/register', {
        title: 'Inscription - PharmaBot',
        errors: [{ msg: 'Erreur serveur. Veuillez réessayer.' }],
        values: req.body,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    }
  }
];

exports.showLogin = (req, res) => {
  res.render('auth/login', {
    title: 'Connexion - PharmaBot',
    errors: [],
    values: {},
    csrfToken: req.csrfToken ? req.csrfToken() : ''
  });
};

exports.login = [
  ...loginValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('auth/login', {
        title: 'Connexion - PharmaBot',
        errors: errors.array(),
        values: req.body,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    }

    const { email, password } = req.body;

    try {
      const user = await User.findByEmail(email);
      if (!user || !await User.verifyPassword(password, user.password)) {
        return res.render('auth/login', {
          title: 'Connexion - PharmaBot',
          errors: [{ msg: 'Email ou mot de passe incorrect.' }],
          values: req.body,
          csrfToken: req.csrfToken ? req.csrfToken() : ''
        });
      }

      if (!user.is_active) {
        return res.render('auth/login', {
          title: 'Connexion - PharmaBot',
          errors: [{ msg: 'Compte désactivé. Contactez l\'administrateur.' }],
          values: req.body,
          csrfToken: req.csrfToken ? req.csrfToken() : ''
        });
      }

      req.session.userId = user.id;
      req.session.userRole = user.role;
      req.session.user = { id: user.id, fullname: user.fullname, email: user.email, role: user.role };

      const returnTo = req.session.returnTo || (user.role === 'admin' ? '/admin' : '/chat');
      delete req.session.returnTo;
      return res.redirect(returnTo);
    } catch (err) {
      console.error('Erreur connexion:', err);
      return res.render('auth/login', {
        title: 'Connexion - PharmaBot',
        errors: [{ msg: 'Erreur serveur. Veuillez réessayer.' }],
        values: req.body,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
      });
    }
  }
];

exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Erreur déconnexion:', err);
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
};

exports.profile = async (req, res) => {
  try {
    const user = await User.getWithSubscription(req.session.userId);
    res.render('auth/profile', {
      title: 'Mon Profil - PharmaBot',
      user,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (err) {
    console.error(err);
    res.redirect('/chat');
  }
};

