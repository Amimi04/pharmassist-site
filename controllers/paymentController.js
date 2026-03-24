const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const Payment = require('../models/Payment');
const { Subscription, PLANS } = require('../models/Subscription');
require('dotenv').config();

exports.showCheckout = async (req, res) => {
  const { plan } = req.params;
  const planData = PLANS[plan];
  if (!planData || planData.price === 0) return res.redirect('/subscription/plans');

  res.render('payment/checkout', {
    title: `Paiement - Plan ${planData.label}`,
    plan,
    planData,
    stripePublicKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder',
    paypalClientId: process.env.PAYPAL_CLIENT_ID || 'test',
    user: req.session?.user,
    csrfToken: req.csrfToken ? req.csrfToken() : ''
  });
};

// Stripe - create payment intent
exports.createStripeIntent = async (req, res) => {
  const { plan } = req.body;
  const planData = PLANS[plan];
  if (!planData || planData.price === 0) {
    return res.json({ error: 'Plan invalide' });
  }

  try {
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(planData.price * 100), // cents
      currency: 'eur',
      metadata: { plan, userId: String(req.session.userId) }
    });

    // Record pending payment
    await Payment.create({
      userId: req.session.userId,
      amount: planData.price,
      currency: 'EUR',
      method: 'stripe',
      paymentIntentId: intent.id,
      plan,
      status: 'pending'
    });

    res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    console.error('Stripe error:', err);
    res.json({ error: err.message });
  }
};

// Stripe - confirm payment
exports.confirmStripePayment = async (req, res) => {
  const { paymentIntentId, plan } = req.body;
  const userId = req.session?.userId;

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status === 'succeeded') {
      const subId = await Subscription.upgrade(userId, plan);
      await Payment.updateStatus(paymentIntentId, 'completed', subId);
      
      // Update session
      req.session.user = { ...req.session.user };
      
      return res.json({ success: true, redirect: '/chat' });
    }
    res.json({ success: false, error: 'Paiement non confirmé' });
  } catch (err) {
    console.error('Stripe confirm error:', err);
    res.json({ success: false, error: err.message });
  }
};

// PayPal - create order
exports.createPaypalOrder = async (req, res) => {
  const { plan } = req.body;
  const planData = PLANS[plan];
  if (!planData || planData.price === 0) {
    return res.json({ error: 'Plan invalide' });
  }

  try {
    const axios = require('axios');
    const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
    const baseURL = process.env.PAYPAL_MODE === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

    // Get token
    const tokenRes = await axios.post(`${baseURL}/v1/oauth2/token`,
      'grant_type=client_credentials',
      { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const token = tokenRes.data.access_token;

    // Create order
    const orderRes = await axios.post(`${baseURL}/v2/checkout/orders`, {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'EUR', value: planData.price.toFixed(2) },
        description: `PharmaBot - Plan ${planData.label}`
      }]
    }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

    const orderId = orderRes.data.id;
    
    await Payment.create({
      userId: req.session.userId,
      amount: planData.price,
      currency: 'EUR',
      method: 'paypal',
      paymentIntentId: orderId,
      plan,
      status: 'pending'
    });

    res.json({ orderId });
  } catch (err) {
    console.error('PayPal create error:', err.response?.data || err.message);
    res.json({ error: 'Erreur PayPal: ' + err.message });
  }
};

// PayPal - capture order
exports.capturePaypalOrder = async (req, res) => {
  const { orderId, plan } = req.body;
  const userId = req.session?.userId;

  try {
    const axios = require('axios');
    const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
    const baseURL = process.env.PAYPAL_MODE === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

    const tokenRes = await axios.post(`${baseURL}/v1/oauth2/token`,
      'grant_type=client_credentials',
      { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const token = tokenRes.data.access_token;

    const captureRes = await axios.post(`${baseURL}/v2/checkout/orders/${orderId}/capture`, {},
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    if (captureRes.data.status === 'COMPLETED') {
      const subId = await Subscription.upgrade(userId, plan);
      await Payment.updateStatus(orderId, 'completed', subId);
      return res.json({ success: true, redirect: '/chat' });
    }
    res.json({ success: false, error: 'Capture échouée' });
  } catch (err) {
    console.error('PayPal capture error:', err.response?.data || err.message);
    res.json({ success: false, error: err.message });
  }
};

exports.success = (req, res) => {
  res.render('payment/success', {
    title: 'Paiement réussi - PharmaBot',
    user: req.session?.user
  });
};

