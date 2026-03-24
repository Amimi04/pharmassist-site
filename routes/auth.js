const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const { isGuest, isAuthenticated } = require('../middleware/auth');

router.get('/register', isGuest, authCtrl.showRegister);
router.post('/register', isGuest, authCtrl.register);
router.get('/login', isGuest, authCtrl.showLogin);
router.post('/login', isGuest, authCtrl.login);
router.get('/logout', authCtrl.logout);
router.get('/profile', isAuthenticated, authCtrl.profile);

module.exports = router;

