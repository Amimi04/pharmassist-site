function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  return res.redirect('/auth/login');
}

function isAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.userRole === 'admin') {
    return next();
  }
  return res.status(403).render('error', {
    title: 'Accès refusé',
    message: 'Vous n\'avez pas les droits nécessaires pour accéder à cette page.',
    user: req.session?.user || null
  });
}

function isGuest(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect('/chat');
  }
  return next();
}

function loadUser(req, res, next) {
  res.locals.user = req.session?.user || null;
  res.locals.isAdmin = req.session?.userRole === 'admin';
  next();
}

module.exports = { isAuthenticated, isAdmin, isGuest, loadUser };

