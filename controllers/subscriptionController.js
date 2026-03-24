const { Subscription, PLANS } = require('../models/Subscription');

exports.showPlans = async (req, res) => {
  const userId = req.session?.userId || null;
  let currentSub = null;

  if (userId) {
    currentSub = await Subscription.getByUserId(userId);
  }

  res.render('subscription/plans', {
    title: 'Nos Abonnements - PharmaBot',
    plans: PLANS,
    currentSub,
    user: req.session?.user || null,
    csrfToken: req.csrfToken ? req.csrfToken() : ''
  });
};

exports.selectPlan = async (req, res) => {
  const { plan } = req.params;
  const userId = req.session?.userId;

  if (!userId) {
    req.session.selectedPlan = plan;
    return res.redirect('/auth/login');
  }

  const planData = PLANS[plan];
  if (!planData || plan === 'gratuit') {
    return res.redirect('/subscription/plans');
  }

  // Redirect to payment
  res.redirect(`/payment/checkout/${plan}`);
};

