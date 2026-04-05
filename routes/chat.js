const express = require('express');
const router = express.Router();
const chatCtrl = require('../controllers/chatController');
const { isAuthenticated } = require('../middleware/auth');
const pharmaSearch = require('../services/pharmaSearchService');

router.get('/', chatCtrl.showChat);
router.post('/ask', chatCtrl.ask);
router.get('/history', isAuthenticated, chatCtrl.history);

/**
 * GET /chat/autocomplete?q=TERM
 * Recherche préfixe pour l'autocomplétion — accessible aux invités.
 * Ne compte PAS dans le quota journalier.
 */
router.get('/autocomplete', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  try {
    const results = await pharmaSearch.searchAutocomplete(q);
    return res.json(results);
  } catch (e) {
    return res.json([]);
  }
});

module.exports = router;

