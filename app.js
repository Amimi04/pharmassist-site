require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const methodOverride = require('method-override');
const { loadUser } = require('./middleware/auth');
const { migrate } = require('./migrations/migrate');
const { testConnection } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Security - Helmet with CSP relaxed for CDN resources
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com", "https://code.jquery.com", "https://js.stripe.com", "https://www.paypal.com", "https://www.paypalobjects.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://api-m.sandbox.paypal.com", "https://api-m.paypal.com"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://www.paypal.com"],
    }
  },
  crossOriginEmbedderPolicy: false
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(methodOverride('_method'));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'pharmabot_fallback_secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24h
  }
}));

// CSRF protection
const csrfProtection = csrf({ cookie: false });
app.use((req, res, next) => {
  // Skip CSRF for API/payment endpoints (JSON APIs)
  const skipPaths = ['/payment/stripe', '/payment/paypal', '/chat/ask'];
  if (skipPaths.some(p => req.path.startsWith(p))) return next();
  csrfProtection(req, res, next);
});

// Load user into locals
app.use(loadUser);

// Flash messages helper
app.use((req, res, next) => {
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;
  delete req.session.success;
  delete req.session.error;
  next();
});

// Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/chat', require('./routes/chat'));
app.use('/subscription', require('./routes/subscription'));
app.use('/payment', require('./routes/payment'));
app.use('/admin', require('./routes/admin'));

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Page introuvable',
    message: 'La page que vous cherchez n\'existe pas.',
    user: req.session?.user || null
  });
});

// Error handler
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('error', {
      title: 'Session expirée',
      message: 'Votre session a expiré. Veuillez rafraîchir la page.',
      user: req.session?.user || null
    });
  }
  console.error('Erreur serveur:', err);
  res.status(500).render('error', {
    title: 'Erreur serveur',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur interne est survenue.',
    user: req.session?.user || null
  });
});

// Start server with auto-migration
async function start() {
  console.log('\n🇧🇪 PharmaBot - Plateforme Pharmaceutique Belge\n');

  // Run migration first (creates the DB if it doesn't exist)
  await migrate();

  // Now test the full connection (DB should exist after migrate)
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Impossible de démarrer: connexion MySQL échouée après migration');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 PharmaBot démarré sur http://localhost:${PORT}`);
    console.log(`👤 Admin: ${process.env.ADMIN_EMAIL}`);
    console.log(`🌍 Mode: ${process.env.NODE_ENV || 'development'}\n`);
  });
}

start().catch(err => {
  console.error('Erreur démarrage:', err);
  process.exit(1);
});

module.exports = app;

