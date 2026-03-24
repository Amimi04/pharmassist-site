const express = require('express');
const router = express.Router();
const chatCtrl = require('../controllers/chatController');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', chatCtrl.showChat);
router.post('/ask', chatCtrl.ask);
router.get('/history', isAuthenticated, chatCtrl.history);

module.exports = router;

