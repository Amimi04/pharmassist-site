const express = require('express');
const router = express.Router();
const subCtrl = require('../controllers/subscriptionController');

router.get('/plans', subCtrl.showPlans);
router.get('/select/:plan', subCtrl.selectPlan);

module.exports = router;

