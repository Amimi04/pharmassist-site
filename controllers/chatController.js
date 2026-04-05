const { processQuestion } = require('../services/chatbotService');
const { Subscription } = require('../models/Subscription');
const { query } = require('../config/database');

exports.showChat = async (req, res) => {
  const userId = req.session?.userId || null;
  let subscription  = null;
  let limitInfo     = null;
  let recentMessages = [];

  try {
    if (userId) {
      subscription = await Subscription.getByUserId(userId);

      // ── Historique: derniers 10 échanges de l'utilisateur ──────────────────
      // ORDER BY created_at ASC → ordre chronologique pour l'affichage
      recentMessages = await query(
        `SELECT question, answer, created_at
         FROM chat_messages
         WHERE user_id = ?
         ORDER BY created_at ASC
         LIMIT 10`,
        [userId]
      );

      // ── Restauration du contexte dوائي depuis l'historique ──────────────────
      // Si aucun contexte actif en session (nouvelle session ou session expirée),
      // on cherche si le dernier message posé correspond à un médicament connu
      // afin que des questions comme "quel est son prix ?" fonctionnent d'emblée.
      if (!req.session.chatContext && recentMessages.length > 0) {
        const lastQuestion = recentMessages[recentMessages.length - 1].question || '';
        if (lastQuestion.trim().length >= 2) {
          const [drugMatch] = await query(
            `SELECT mpcv, mpnm, narcotic, orphan, specrules, bt, amb, hosp
             FROM mp WHERE mpnm LIKE ? LIMIT 1`,
            [`%${lastQuestion.trim()}%`]
          );
          if (drugMatch) {
            req.session.chatContext = {
              lastDrug:   drugMatch,
              lastIntent: 'history',
              timestamp:  Date.now()
            };
          }
        }
      }
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
    recentMessages,
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

  // L'admin est exempté de toute limite quotidienne et du compteur d'usage.
  // La valeur de role est définie dans authController.js (req.session.user.role).
  const isAdmin = req.session?.user?.role === 'admin';

  try {
    // Check rate limit (ignoré pour l'admin)
    let limitInfo = null;
    if (!isAdmin) {
      limitInfo = await Subscription.checkDailyLimit(userId, sessionId);
      if (!limitInfo.allowed) {
        // Récupère le plan actuel pour orienter le message d'upgrade
        let currentPlan = 'guest';
        if (userId) {
          const sub = await Subscription.getByUserId(userId);
          currentPlan = sub ? sub.plan : 'gratuit';
        }

        const message = userId
          ? `Vous avez atteint votre limite quotidienne de ${limitInfo.dailyLimit} question(s). Passez à un abonnement supérieur pour continuer.`
          : `Vous avez atteint la limite quotidienne de ${limitInfo.dailyLimit} question(s) pour les invités. Créez un compte gratuit pour obtenir 5 questions/jour!`;

        return res.json({
          success:      false,
          limitReached: true,
          message,
          currentPlan,
          upgradeUrl:   '/subscription',
          limitInfo
        });
      }
    }

    // ── Contexte conversationnel ────────────────────────────────────────────
    // Récupère le contexte de la session et vérifie son expiration (30 min)
    let context = req.session.chatContext || null;
    const CONTEXT_TTL = 30 * 60 * 1000; // 30 minutes en ms
    if (context && (Date.now() - context.timestamp) > CONTEXT_TTL) {
      context = null;
      req.session.chatContext = null;
    }

    // Process the question — on passe le contexte comme 2e argument
    const result = await processQuestion(question.trim(), context);

    // ── Mise à jour du contexte après la réponse ────────────────────────────
    // On préserve le contexte existant et on ne remplace que les champs pertinents
    const prevContext = req.session.chatContext || {};

    if (result.type === 'detail' && result.data && result.data.mpcv) {
      req.session.chatContext = {
        ...prevContext,
        lastDrug:   result.data,
        lastIntent: 'detail',
        timestamp:  Date.now()
      };
    } else if (result.raw && result.raw.length === 1 && result.raw[0].mpcv) {
      req.session.chatContext = {
        ...prevContext,
        lastDrug:   result.raw[0],
        lastIntent: result.searchType || null,
        timestamp:  Date.now()
      };
    }

    // ── Pagination: sauvegarde de la dernière recherche pour "afficher plus" ──
    // Stocke le lastSearch retourné par processQuestion dans la session.
    // Lors de l'intent MORE, newOffset est renvoyé pour mettre à jour l'offset.
    if (result.lastSearch) {
      req.session.chatContext = {
        ...(req.session.chatContext || prevContext),
        lastSearch: result.lastSearch
      };
    } else if (result.newOffset !== undefined && prevContext.lastSearch) {
      // Mise à jour de l'offset après une pagination
      req.session.chatContext = {
        ...(req.session.chatContext || prevContext),
        lastSearch: { ...prevContext.lastSearch, offset: result.newOffset }
      };
    }

    // Increment usage (ignoré pour l'admin — la session admin n'a pas de compteur)
    if (!isAdmin) {
      await Subscription.incrementUsage(userId, sessionId);
    }

    // Save to chat history (toujours actif, y compris pour l'admin)
    const answerText = result.text || (result.items ? result.items.join('\n') : '');
    try {
      await query(
        'INSERT INTO chat_messages (user_id, session_id, question, answer) VALUES (?, ?, ?, ?)',
        [userId, sessionId, question.trim(), answerText.substring(0, 5000)]
      );
    } catch (e) {
      // Non-critical, don't fail
    }

    // Get updated limit info (null pour l'admin = illimité)
    const updatedLimit = isAdmin
      ? { allowed: true, remaining: Infinity, dailyLimit: Infinity }
      : await Subscription.checkDailyLimit(userId, sessionId);

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

