const express = require('express');
const router = express.Router();
const adminCtrl = require('../controllers/adminController');
const { isAdmin } = require('../middleware/auth');

router.use(isAdmin);

router.get('/', adminCtrl.dashboard);
router.get('/users', adminCtrl.users);
router.post('/users/:id/role', adminCtrl.updateUserRole);
router.delete('/users/:id', adminCtrl.deleteUser);
router.get('/payments', adminCtrl.payments);
router.get('/medicines', adminCtrl.medicines);
router.get('/substances', adminCtrl.substances);
router.get('/galenic', adminCtrl.galenic);
router.get('/indications', adminCtrl.indications);
router.get('/messages', adminCtrl.messages);

module.exports = router;

