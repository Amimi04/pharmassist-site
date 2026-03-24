const express = require('express');
const router = express.Router();
const pharma = require('../services/pharmaSearchService');

router.get('/', async (req, res) => {
  let pharmaStats = { medicaments: 0, presentations: 0, substances: 0, formes: 0 };
  try {
    pharmaStats = await pharma.getStats();
  } catch (e) {}

  res.render('index', {
    title: 'PharmaBot - Assistant Pharmaceutique Belge 🇧🇪',
    user: req.session?.user || null,
    pharmaStats
  });
});

module.exports = router;

