const { processQuestion } = require('../services/chatbotService');
const { Subscription } = require('../models/Subscription');
const { query } = require('../config/database');

exports.showChat = async (req, res) => {
  const userId = req.session?.userId || null;
  let subscription = null;
  let limitInfo = null;

  try {
    if (userId) {
      subscription = await Subscription.getByUserId(userId);
    }
    limitInfo = await Subscription.checkDailyLimit(userId, req.sessionID);
  } catch (err) {
    console.error('Erreur chat show:', err);
  }

  res.render('chat/index', {
    title: 'PharmaBot - Assistant Pharmaceutique Belge',
    user: req.session?.user || null,
    subscription,
    limitInfo,
    csrfToken: req.csrfToken ? req.csrfToken() : ''
  });
};

exports.ask = async (req, res) => {
  const userId = req.session?.userId || null;
  const sessionId = req.sessionID;
  const { question } = req.body;

  if (!question || question.trim().length < 2) {
    return res.json({ success: false, error: 'Question trop courte.' });
  }

  try {
    // Check rate limit
    const limitInfo = await Subscription.checkDailyLimit(userId, sessionId);
    if (!limitInfo.allowed) {
      const message = userId
        ? `Vous avez atteint votre limite de ${limitInfo.dailyLimit} question(s)/jour. Passez à un plan supérieur pour continuer.`
        : `Vous avez atteint la limite de ${limitInfo.dailyLimit} question(s)/jour pour les invités. Créez un compte gratuit pour 5 questions/jour!`;
      return res.json({
        success: false,
        limitReached: true,
        error: message,
        limitInfo
      });
    }

    // Process the question
    const result = await processQuestion(question.trim());

    // Increment usage
    await Subscription.incrementUsage(userId, sessionId);

    // Save to chat history
    const answerText = result.text || (result.items ? result.items.join('\n') : '');
    try {
      await query(
        'INSERT INTO chat_messages (user_id, session_id, question, answer) VALUES (?, ?, ?, ?)',
        [userId, sessionId, question.trim(), answerText.substring(0, 5000)]
      );
    } catch (e) {
      // Non-critical, don't fail
    }

    // Get updated limit info
    const updatedLimit = await Subscription.checkDailyLimit(userId, sessionId);

    return res.json({
      success: true,
      result,
      limitInfo: updatedLimit
    });
  } catch (err) {
    console.error('Erreur chatbot:', err);
    return res.json({
      success: false,
      error: 'Erreur interne. Veuillez réessayer.'
    });
  }
};

exports.history = async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.redirect('/auth/login');

  try {
    const messages = await query(
      'SELECT * FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    res.render('chat/history', {
      title: 'Historique - PharmaBot',
      messages,
      user: req.session?.user
    });
  } catch (err) {
    console.error(err);
    res.redirect('/chat');
  }
};

