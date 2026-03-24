const express = require('express');
const router = express.Router();
const payCtrl = require('../controllers/paymentController');
const { isAuthenticated } = require('../middleware/auth');

router.get('/checkout/:plan', isAuthenticated, payCtrl.showCheckout);
router.post('/stripe/intent', isAuthenticated, payCtrl.createStripeIntent);
router.post('/stripe/confirm', isAuthenticated, payCtrl.confirmStripePayment);
router.post('/paypal/create', isAuthenticated, payCtrl.createPaypalOrder);
router.post('/paypal/capture', isAuthenticated, payCtrl.capturePaypalOrder);
router.get('/success', isAuthenticated, payCtrl.success);

module.exports = router;

