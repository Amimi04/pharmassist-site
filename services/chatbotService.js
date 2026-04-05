const pharma = require('./pharmaSearchService');
const { suggestCorrections } = require('./spellingService');

/**
 * Moteur de chatbot pharmaceutique belge
 * Analyse sémantique en français des questions médicales/pharmaceutiques
 */

// ── Dictionnaire maladie/symptôme → mots-clés SAM ────────────────────────────
// Les mots-clés correspondent aux termes présents dans:
//   ir.firnm  (classifications SAM, ex: "Médicaments antidiabétiques")
//   hyr.ti    (titres des groupes thérapeutiques)
//   innm.finnm (noms des substances actives en français)
//   innm.fbase (base chimique de la substance)
//
// Clés: noms de maladies/symptômes en français (avec accents pour l'affichage)
// Valeurs: mots-clés SAM associés (sans accents tolérés car recherchés via LIKE)
// NOTE SUR LES MOTS-CLÉS:
// Les clés correspondent aux mots utilisés par les patients.
// Les valeurs sont des termes présents dans les données SAM réelles:
//   - ir.firnm  → classifications SAM ("Médicaments antidiabétiques")
//   - hyr.ti    → noms de substances/groupes ("Spécialités [Metformine]", "Amlodipine")
//   - innm.finnm → substances actives ("metformine", "losartan", "paracétamol")
//   - innm.fbase → base chimique ("losartan", "metformine")
// Les mots-clés doivent correspondre aux termes RÉELS de la base SAM belge.
const DISEASE_MAP = {
  // Fièvre & douleur — ir.firnm contient "fièvre", innm.finnm "paracétamol"/"ibuprofène"
  'fièvre':        ['fièvre', 'paracétamol', 'ibuprofène', 'antipyrétique'],
  'douleur':       ['paracétamol', 'ibuprofène', 'analgésique', 'antalgique', 'douleur'],
  'mal de tête':   ['migraine', 'céphalée', 'sumatriptan', 'paracétamol'],
  'migraine':      ['migraine', 'sumatriptan', 'céphalée', 'zolmitriptan'],
  // Cardiovasculaire — hyr.ti contient "Amlodipine", "Lisinopril", "Sartan + diurétique"
  // innm.finnm contient "losartan", "amlodipine", "bisoprolol", etc.
  'hypertension':  ['losartan', 'amlodipine', 'lisinopril', 'ramipril', 'bisoprolol',
                    'enalapril', 'perindopril', 'sartan', 'candesartan', 'valsartan'],
  'tension':       ['losartan', 'amlodipine', 'lisinopril', 'ramipril', 'bisoprolol'],
  // hyr.ti contient "Simvastatine", "Atorvastatine", "Rosuvastatine"
  'cholestérol':   ['simvastatine', 'atorvastatine', 'rosuvastatine', 'pravastatine',
                    'statine', 'hypolipémiant'],
  'cholesterol':   ['simvastatine', 'atorvastatine', 'rosuvastatine', 'statine'],
  // Diabète — hyr.ti contient "Spécialités [Metformine]", "Gliptine + metformine"
  // ir.firnm contient "antidiabétique", innm.finnm "metformine", "insuline"
  'diabète':       ['metformine', 'insuline', 'antidiabétique', 'gliptine',
                    'diabète', 'sitagliptine', 'empagliflozine'],
  'diabete':       ['metformine', 'insuline', 'antidiabétique', 'gliptine', 'diabète'],
  // Respiratoire — innm.finnm contient "salbutamol", "fluticasone", etc.
  'toux':          ['dextrométhorphane', 'codéine', 'antitussif', 'expectorant',
                    'acétylcystéine', 'mucolytique', 'toux'],
  'asthme':        ['salbutamol', 'fluticasone', 'béclométasone', 'formotérol',
                    'budesonide', 'montelukast', 'bronchodilatateur'],
  'rhume':         ['xylométazoline', 'pseudoéphédrine', 'rhinite', 'décongestionnant'],
  'allergie':      ['cétirizine', 'loratadine', 'fexofénadine', 'desloratadine',
                    'antihistaminique', 'allergie'],
  'rhinite':       ['xylométazoline', 'cétirizine', 'rhinite', 'loratadine'],
  // Digestif — innm.finnm contient "oméprazole", "lopéramide", "métoclopramide"
  'gastrite':      ['oméprazole', 'pantoprazole', 'ésoméprazole', 'lansoprazole',
                    'antiacide', 'ulcère'],
  'ulcère':        ['oméprazole', 'pantoprazole', 'ésoméprazole', 'antiacide', 'ulcère'],
  'diarrhée':      ['lopéramide', 'diarrhée', 'antidiarrhéique'],
  'diarrhee':      ['lopéramide', 'diarrhée', 'antidiarrhéique'],
  'nausée':        ['métoclopramide', 'ondansétron', 'dompéridone', 'antiémétique', 'nausée'],
  'nausee':        ['métoclopramide', 'ondansétron', 'dompéridone', 'nausée'],
  'constipation':  ['lactulose', 'macrogol', 'laxatif', 'constipation'],
  // Infections — innm.finnm contient "amoxicilline", "céfuroxime", etc.
  'infection':     ['amoxicilline', 'amoxiclavulanate', 'céfuroxime', 'antibiotique',
                    'anti-infectieux'],
  'antibiotique':  ['amoxicilline', 'amoxiclavulanate', 'céfuroxime', 'antibiotique',
                    'azithromycine', 'clarithromycine'],
  // Anxiété & sommeil — innm.finnm contient "alprazolam", "lorazépam", "zolpidem"
  'anxiété':       ['alprazolam', 'lorazépam', 'diazépam', 'anxiolytique', 'benzodiazépine'],
  'anxiete':       ['alprazolam', 'lorazépam', 'diazépam', 'anxiolytique'],
  'insomnie':      ['zolpidem', 'zopiclone', 'témazépam', 'somnifère', 'hypnotique'],
  'stress':        ['alprazolam', 'lorazépam', 'anxiolytique'],
  // Dermatologie — hyr.ti contient "Dermocorticoïdes", innm.finnm "hydrocortisone"
  'eczéma':        ['hydrocortisone', 'béclométasone', 'dermocorticoïde', 'eczéma',
                    'dermite'],
  'eczema':        ['hydrocortisone', 'béclométasone', 'dermocorticoïde', 'eczéma'],
  'psoriasis':     ['calcipotriol', 'méthotrexate', 'psoriasis', 'dermocorticoïde'],
  // Os & articulations — innm.finnm contient "diclofénac", "ibuprofène", "naproxène"
  'arthrite':      ['diclofénac', 'naproxène', 'ibuprofène', 'anti-inflammatoire', 'AINS'],
  'arthrose':      ['diclofénac', 'naproxène', 'ibuprofène', 'anti-inflammatoire'],
  'inflammation':  ['diclofénac', 'ibuprofène', 'naproxène', 'anti-inflammatoire', 'AINS'],
  // Thyroïde — innm.finnm contient "lévothyroxine"
  'thyroïde':      ['lévothyroxine', 'thyroïde', 'propylthiouracile', 'thiamazole'],
  'thyroide':      ['lévothyroxine', 'thyroïde', 'propylthiouracile'],
};

/**
 * Recherche si le terme normalisé (sans accents, minuscules) correspond
 * à une clé du DISEASE_MAP. Renvoie { disease, keywords } ou null.
 *
 * La comparaison utilise une regex à frontière de mot pour éviter les faux positifs:
 *   "douleur" → match dans "j ai une douleur" ✅
 *   "toux"    → pas de match dans "atoux" ✅
 *
 * @param {string} normalizedTerm - Terme déjà normalisé par extractSearchTerm()
 * @returns {{ disease: string, keywords: string[] } | null}
 */
function findDiseaseKeywords(normalizedTerm) {
  if (!normalizedTerm || normalizedTerm.length < 3) return null;

  // Singularisation légère du terme pour la comparaison uniquement (ne modifie pas l'affichage).
  // Couvre les pluriels courants du français:
  //   "douleurs"     → "douleur"   (s final)
  //   "allergies"    → "allergie"  (es final)
  //   "maux"         → "mal"       (aux → al, ex: maux de tête)
  //   "maladies"     → "maladie"   (ies → ie)
  // Singularisation mot-par-mot du terme pour la comparaison uniquement.
  // Règles (par ordre de priorité, du plus spécifique au plus général):
  //   "eaux" → "eau"  (gâteaux, eaux)
  //   "aux"  → "al"   (maux → mal, travaux → travail approx)
  //   "s"    → ""     (douleurs, migraines, allergies — retire juste le s final)
  //   Tous les autres pluriels -s réguliers sont couverts par la dernière règle.
  const singular = normalizedTerm
    .split(' ')
    .map(w =>
      w.endsWith('eaux') ? w.slice(0, -4) + 'eau' :  // "eaux" → "eau"
      w.endsWith('aux')  ? w.slice(0, -3) + 'al'  :  // "maux" → "mal"
      w.endsWith('s')    ? w.slice(0, -1)          :  // "douleurs"→"douleur", "migraines"→"migraine"
      w
    )
    .join(' ');

  for (const [disease, keywords] of Object.entries(DISEASE_MAP)) {
    const normalizedDisease = normalizeText(disease);
    // Frontière de mot: le nom de la maladie doit être un mot entier dans le terme
    const escaped = normalizedDisease.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
    if (pattern.test(normalizedTerm) || pattern.test(singular)) {
      return { disease, keywords };
    }
  }
  return null;
}

// Patterns d'intention
const INTENTS = {
  SEARCH_MEDICINE:    /\b(médicament|medicament|medoc|comprimé|gélule|injection|traitement|cherche|trouver|existe|disponible)\b/i,
  SEARCH_SUBSTANCE:   /\b(substance|principe actif|molécule|composant|contient|base de|avec)\b/i,
  SEARCH_INDICATION:  /\b(indication|pour traiter|contre|maladie|pathologie|soigner|thérapeutique|sert à|utilise pour)\b/i,
  SEARCH_FORM:        /\b(comprimé|gélule|injection|sirop|crème|pommade|patch|spray|suppositoire|forme|galénique)\b/i,
  NARCOTIC:           /\b(stupéfiant|narcotique|morphine|opioïde|opiacé|codéine|tramadol)\b/i,
  ORPHAN:             /\b(orphelin|maladie rare|rare)\b/i,
  BIOSIMILAR:         /\b(biosimilaire|biologique|biotech)\b/i,
  PRICE:              /\b(prix|coût|cout|combien|remboursement|tarif|moins cher|générique)\b/i,
  COMPOSITION:        /\b(composition|ingrédient|excipient|contient quoi|constituant)\b/i,
  DETAIL:             /\b(détail|information|notice|posologie|comment prendre|dosage|dose)\b/i,
  HOSPITAL:           /\b(hospitalier|hôpital|officine|pharmacie|prescrit|dispensé)\b/i,
  MORE:               /\b(plus|encore|suite|davantage|afficher plus|voir plus|suivant|next)\b/i,
};

function detectIntent(text) {
  const intents = [];
  for (const [intent, pattern] of Object.entries(INTENTS)) {
    if (pattern.test(text)) intents.push(intent);
  }
  return intents;
}

/**
 * Normalise un texte: supprime les accents, met en minuscules et retire les espaces.
 * Ex: normalizeText('Ibuprofène') → 'ibuprofene'
 *     normalizeText('paracétamol') → 'paracetamol'
 */
function normalizeText(text) {
  return text
    .normalize('NFD')              // décompose les caractères accentués (é → e + ́)
    .replace(/[\u0300-\u036f]/g, '') // supprime les combining diacritical marks
    .toLowerCase()
    .trim();
}

function extractSearchTerm(text) {
  // ── Étape 1: Suppression des articles définis et prépositions contractées ──────
  // Doit se faire EN PREMIER, avant toute autre règle, car ces mots précèdent
  // directement le nom du médicament et faussent le matching en base de données.
  // Ordre important: "de l'" et "de la/le" avant "l'" et "le/la/les",
  // puis les formes contractées ("du", "des") en dernier.
  let term = text
    .replace(/\bde\s+l'/gi, '')          // "de l'aspirine"    → "aspirine"
    .replace(/\bde\s+l[ae]?\s+/gi, '')   // "de la/le/l "      → ""
    .replace(/\bdu\s+/gi, '')            // "du losartan"      → "losartan"
    .replace(/\bdes\s+/gi, '')           // "des antibiotiques" → "antibiotiques"
    .replace(/\bl'/gi, '')               // "l'ibuprofène"     → "ibuprofène"
    .replace(/\bl[ae]s?\s+/gi, '')       // "le/la/les "       → ""
    .replace(/\bun[e]?\s+/gi, '')        // "un/une "          → ""
    .trim();

  // ── Étape 2: Suppression des formules interrogatives et mots vides français ───
  const cleaned = term
    .replace(/^(qu'est-ce que|qu'est ce que|quelle est|quels sont|comment|est-ce que|y a-t-il|existe-t-il)\s+/i, '')
    .replace(/\b(le médicament|la substance|les médicaments|les substances|un médicament|une substance)\b/gi, '')
    .replace(/\b(pour|contre|traiter|soigner|utiliser|prendre)\b/gi, '')
    // Mots liés au PRICE intent — à retirer pour isoler le nom du médicament
    .replace(/\b(prix|co[uû]t|combien|tarif|moins cher|remboursement|co[uû]te|vaut)\b/gi, '')
    // Mots liés au COMPOSITION/DETAIL intent — à retirer pour isoler le nom
    .replace(/\b(composition|ingr[eé]dients?|excipients?|constituants?|notice|posologie|dosage|dose|d[eé]tail|information|informations)\b/gi, '')
    .replace(/[?!.']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Normalisation finale: suppression des accents + minuscules
  return normalizeText(cleaned);
}

function formatMedicineResult(med) {
  let response = `💊 **${med.mpnm}**\n`;
  if (med.indication)      response += `📋 Indication: ${med.indication}\n`;
  if (med.categorie)       response += `🏷️ Catégorie: ${med.categorie}\n`;
  if (med.forme_principale) response += `💊 Forme: ${med.forme_principale}\n`;
  if (med.prix_min != null) response += `💰 À partir de: ${parseFloat(med.prix_min).toFixed(2)} €\n`;

  const badges = [];
  if (med.narcotic)          badges.push('⚠️ Stupéfiant');
  if (med.orphan)            badges.push('🔬 Médicament orphelin');
  if (med.bt)                badges.push('🧬 Biosimilaire');
  if (med.hosp && !med.amb)  badges.push('🏥 Usage hospitalier uniquement');
  if (med.amb  && !med.hosp) badges.push('🏪 Disponible en officine');
  if (med.specrules)         badges.push('📜 Règles spéciales d\'autorisation');

  if (badges.length) response += badges.join(' | ') + '\n';
  return response;
}

function formatSubstanceResult(sub) {
  let response = `🔬 **${sub.substance_fr || sub.substance_nl}**\n`;
  if (sub.fbase) response += `   Base: ${sub.fbase}\n`;
  response += `   📦 ${sub.nb_medicaments} médicament(s) disponible(s)\n`;
  if (sub.hosp && !sub.amb) response += '   🏥 Usage hospitalier\n';
  return response;
}

function formatPresentationResult(pres) {
  let response = `📦 **${pres.mppnm}**\n`;
  if (pres.forme_galenique) response += `   Forme: ${pres.forme_galenique}\n`;
  if (pres.pupr) response += `   💰 Prix public: ${parseFloat(pres.pupr).toFixed(2)} €\n`;
  if (pres.cheapest) response += `   ✅ Moins cher\n`;
  return response;
}

// Patterns de pronoms/références contextuelles (détection de la référence au médicament précédent)
const CONTEXT_REFS = /\b(il|elle|ce m[ée]dicament|celui-ci|celle-ci|son prix|sa composition|ses indications|le m[eê]me|cet|cette)\b/i;

/**
 * Formate uniquement les informations de prix d'un médicament (contexte: "quel est son prix ?")
 */
function formatPriceResponse(detail) {
  if (!detail) return 'Informations de prix introuvables.';
  let text = `# 💰 Prix — ${detail.mpnm}\n\n`;
  if (detail.presentations && detail.presentations.length > 0) {
    for (const pres of detail.presentations) {
      const price = pres.pupr ? `${parseFloat(pres.pupr).toFixed(2)} €` : 'N/A';
      text += `• ${pres.mppnm} — ${price}`;
      if (pres.cheapest) text += ' ✅ (moins cher)';
      text += '\n';
    }
  } else {
    text += 'Aucune information de prix disponible.';
  }
  return text;
}

/**
 * Formate uniquement la composition d'un médicament (contexte: "quelle est sa composition ?")
 */
function formatCompositionResponse(detail) {
  if (!detail) return 'Informations de composition introuvables.';
  let text = `# 🔬 Composition — ${detail.mpnm}\n\n`;
  if (detail.compositions && detail.compositions.length > 0) {
    for (const comp of detail.compositions) {
      text += `• ${comp.substance_fr || comp.substance_nl}: ${comp.inq} ${comp.inu || ''}\n`;
    }
  } else {
    text += 'Aucune information de composition disponible.';
  }
  return text;
}

async function processQuestion(question, context = null) {
  const intents = detectIntent(question);
  const term = extractSearchTerm(question);

  // ── Gestion du contexte conversationnel (pronoms/références) ───────────────
  // Si le message contient un pronom référençant le médicament précédent
  if (context && context.lastDrug && CONTEXT_REFS.test(question)) {
    const drug = context.lastDrug;
    const mpcv = drug.mpcv; // présent dans résultats mp et dans detail
    if (mpcv) {
      if (intents.includes('PRICE')) {
        const detail = await pharma.getMedicamentDetails(mpcv);
        if (detail) return { type: 'detail', title: `💰 Prix de ${drug.mpnm}`, text: formatPriceResponse(detail), data: detail };
      }
      if (intents.includes('COMPOSITION')) {
        const detail = await pharma.getMedicamentDetails(mpcv);
        if (detail) return { type: 'detail', title: `🔬 Composition de ${drug.mpnm}`, text: formatCompositionResponse(detail), data: detail };
      }
      if (intents.includes('DETAIL')) {
        const detail = await pharma.getMedicamentDetails(mpcv);
        if (detail) return { type: 'detail', title: `💊 ${drug.mpnm}`, text: formatDetailedResponse(detail), data: detail };
      }
    }
    // Aucun intent spécifique reconnu → on continue la recherche normale
  }

  // ── Alternatives/prix via contexte sans pronom (ex: "le prix", "combien coûte-t-il") ──
  // Déclenché quand PRICE intent est détecté ET qu'un médicament précédent est en mémoire,
  // même si la question ne contient pas de pronom explicite.
  if (context && context.lastDrug && context.lastDrug.mpcv && intents.includes('PRICE')) {
    const drug = context.lastDrug;
    const alternatives = await pharma.getCheapestAlternatives(drug.mpcv);
    if (alternatives.length > 0) {
      return {
        type: 'list',
        title: `💰 Présentations disponibles — ${drug.mpnm} (${alternatives.length} présentation(s))`,
        items: alternatives.map(alt => {
          const price = alt.pupr ? `${parseFloat(alt.pupr).toFixed(2)} €` : 'N/A';
          const form  = alt.forme ? ` — ${alt.forme}` : '';
          const badge = alt.cheapest ? ' ✅' : '';
          return `📦 **${alt.mppnm}**${form} — ${price}${badge}`;
        }),
        raw: alternatives,
        searchType: 'price'
      };
    } else {
      return {
        type: 'empty',
        text: `Aucune information de prix disponible pour **${drug.mpnm}**.`
      };
    }
  }

  // ── Pagination: "afficher plus", "voir plus", "suivant" ───────────────────
  // Si l'intent MORE est détecté et qu'une recherche précédente est en session,
  // on relance la même requête avec un offset incrémenté de 10.
  if (intents.includes('MORE') && context?.lastSearch) {
    const ls      = context.lastSearch;
    const newOffset = (ls.offset || 0) + 10;
    let moreResults = [];
    let moreTitle   = '';

    if (ls.type === 'medicine') {
      moreResults = await pharma.searchByMedicineName(ls.term, 10, newOffset);
      moreTitle   = `💊 Suite pour "${ls.term}" (résultats ${newOffset + 1}–${newOffset + moreResults.length})`;
    } else if (ls.type === 'disease') {
      moreResults = await pharma.searchByDisease(ls.keywords, 10, newOffset);
      moreTitle   = `💊 Suite pour "${ls.disease}" (résultats ${newOffset + 1}–${newOffset + moreResults.length})`;
    } else if (ls.type === 'combined') {
      moreResults = await pharma.searchCombined(ls.combinedOpts, 10, newOffset);
      moreTitle   = `🔍 Suite de la recherche (résultats ${newOffset + 1}–${newOffset + moreResults.length})`;
    }

    if (moreResults.length > 0) {
      return {
        type:       'list',
        title:      moreTitle,
        items:      moreResults.map(formatMedicineResult),
        raw:        moreResults,
        searchType: ls.type,
        newOffset   // transmis au controller pour mise à jour de la session
      };
    }
    return {
      type: 'empty',
      text: 'Il n\'y a plus de résultats à afficher pour cette recherche.'
    };
  }

  if (intents.length === 0 && term.length < 3) {
    return {
      type: 'help',
      text: `Je suis PharmaBot, votre assistant pharmaceutique belge 🇧🇪\n\nJe peux vous aider à rechercher:\n• Un médicament par nom (ex: "Aspirine", "Doliprane")\n• Une substance active (ex: "paracétamol", "ibuprofène")\n• Des médicaments par indication thérapeutique\n• Des informations sur les stupéfiants, médicaments orphelins ou biosimilaires\n• Les formes galéniques disponibles\n\nPosez votre question en français!`
    };
  }

  // Special category searches
  if (intents.includes('NARCOTIC')) {
    const results = await pharma.searchNarcotics(15);
    if (results.length === 0) return { type: 'empty', text: 'Aucun stupéfiant trouvé.' };
    return {
      type: 'list',
      title: `⚠️ Stupéfiants répertoriés (${results.length} trouvés)`,
      items: results.map(formatMedicineResult),
      raw: results
    };
  }

  if (intents.includes('ORPHAN') && intents.includes('SEARCH_MEDICINE')) {
    const results = await pharma.searchOrphanDrugs(15);
    return {
      type: 'list',
      title: `🔬 Médicaments orphelins (${results.length} trouvés)`,
      items: results.map(formatMedicineResult),
      raw: results
    };
  }

  if (intents.includes('BIOSIMILAR')) {
    const results = await pharma.searchBiosimilars(15);
    return {
      type: 'list',
      title: `🧬 Biosimilaires (${results.length} trouvés)`,
      items: results.map(formatMedicineResult),
      raw: results
    };
  }

  // ── COMPOSITION directe (sans pronom) ──────────────────────────────────────
  // Ex: "composition aspirine", "ingrédients paracétamol", "excipients dafalgan"
  // Condition: COMPOSITION intent + term + le contexte pronom n'est PAS déjà actif
  // On accepte 1 à 3 résultats et on prend le premier (le plus pertinent).
  if (intents.includes('COMPOSITION') && term.length >= 2
      && !(context?.lastDrug && CONTEXT_REFS.test(question))) {
    const compResults = await pharma.searchByMedicineName(term, 3);
    if (compResults.length >= 1) {
      const detail = await pharma.getMedicamentDetails(compResults[0].mpcv);
      if (detail) return {
        type:  'detail',
        title: `🔬 Composition — ${detail.mpnm}`,
        text:  formatCompositionResponse(detail),
        data:  detail
      };
    }
  }

  // ── DETAIL direct (sans pronom) ─────────────────────────────────────────────
  // Ex: "notice aspirine", "posologie paracétamol", "comment prendre le dafalgan"
  // On accepte 1 à 3 résultats et on prend le premier (le plus pertinent).
  if (intents.includes('DETAIL') && term.length >= 2
      && !(context?.lastDrug && CONTEXT_REFS.test(question))) {
    const detailResults = await pharma.searchByMedicineName(term, 3);
    if (detailResults.length >= 1) {
      const detail = await pharma.getMedicamentDetails(detailResults[0].mpcv);
      if (detail) return {
        type:  'detail',
        title: `💊 ${detail.mpnm}`,
        text:  formatDetailedResponse(detail),
        data:  detail
      };
    }
  }

  // ── Recherche par maladie/symptôme via DISEASE_MAP ────────────────────────
  // Se déclenche si le terme normalisé correspond à une clé du DISEASE_MAP,
  // indépendamment de l'intent détecté. Cela permet de gérer:
  //   - "fièvre" seul (aucun intent SEARCH_INDICATION)
  //   - "médicament contre le diabète" (term = "medicament le diabete")
  //   - "tension" (term = "tension")
  const diseaseMatch = findDiseaseKeywords(term);
  if (diseaseMatch) {
    const results = await pharma.searchByDisease(diseaseMatch.keywords, 10);
    if (results.length > 0) {
      return {
        type:       'list',
        title:      `💊 Médicaments pour "${diseaseMatch.disease}" (${results.length} résultat(s))`,
        items:      results.map(formatMedicineResult),
        raw:        results,
        searchType: 'disease',
        lastSearch: { type: 'disease', disease: diseaseMatch.disease, keywords: diseaseMatch.keywords, offset: 0 }
      };
    }
    // Si aucun résultat malgré le match, on continue le flux normal
  }

  // ── PRICE intent avec nom de médicament direct (sans contexte préalable) ──────
  // Ex: "prix aspirine", "combien coûte le doliprane"
  // Condition: PRICE détecté + aucun lastDrug en session (sinon géré plus haut) + term présent
  if (intents.includes('PRICE') && !context?.lastDrug && term.length >= 2) {
    const priceResults = await pharma.searchByMedicineName(term, 10);
    if (priceResults.length === 1) {
      // Résultat unique: afficher les présentations avec leurs prix
      const alternatives = await pharma.getCheapestAlternatives(priceResults[0].mpcv);
      if (alternatives.length > 0) {
        return {
          type:  'list',
          title: `💰 Prix — ${priceResults[0].mpnm} (${alternatives.length} présentation(s))`,
          items: alternatives.map(alt => {
            const price = alt.pupr ? `${parseFloat(alt.pupr).toFixed(2)} €` : 'N/A';
            const form  = alt.forme ? ` — ${alt.forme}` : '';
            const badge = alt.cheapest ? ' ✅' : '';
            return `📦 **${alt.mppnm}**${form} — ${price}${badge}`;
          }),
          raw:        [priceResults[0]],
          searchType: 'price'
        };
      }
    } else if (priceResults.length > 1) {
      // Plusieurs résultats: liste avec prix minimum pour chaque médicament
      return {
        type:       'list',
        title:      `💰 Prix pour "${term}" (${priceResults.length} médicament(s))`,
        items:      priceResults.map(formatMedicineResult),
        raw:        priceResults,
        searchType: 'price'
      };
    }
    // Aucun résultat → continue vers la recherche normale
  }

  // Search by active substance first if intent detected
  if (intents.includes('SEARCH_SUBSTANCE') && term.length >= 3) {
    const results = await pharma.searchByActiveSubstance(term, 10);
    if (results.length > 0) {
      return {
        type: 'list',
        title: `🔬 Substances actives contenant "${term}" (${results.length} résultat(s))`,
        items: results.map(formatSubstanceResult),
        raw: results,
        searchType: 'substance'
      };
    }
  }

  // Search by indication
  if (intents.includes('SEARCH_INDICATION') && term.length >= 3) {
    const results = await pharma.searchByIndication(term, 10);
    if (results.length > 0) {
      return {
        type: 'list',
        title: `💊 Médicaments pour "${term}" (${results.length} résultat(s))`,
        items: results.map(formatMedicineResult),
        raw: results,
        searchType: 'indication'
      };
    }
  }

  // ── Recherche combinée multi-intents ────────────────────────────────────────
  // Se déclenche quand une forme galénique + un terme sont détectés ensemble,
  // ou quand des filtres hospital/officine/non-narcotique sont combinés avec un terme.
  const GALENIC_FORMS = ['comprimé', 'gélule', 'injection', 'sirop', 'crème', 'pommade', 'spray', 'patch', 'suppositoire'];
  const questionLower  = question.toLowerCase();
  const detectedForm   = GALENIC_FORMS.find(ft => questionLower.includes(ft));

  // Retire le mot de forme galénique du terme pour un terme de recherche plus propre
  const termWithoutForm = detectedForm
    ? term.replace(new RegExp(`\\b${detectedForm}\\b`, 'gi'), '').replace(/\s+/g, ' ').trim()
    : term;

  const isNonNarcotic = /\b(sans\s+stup[ée]fiant|non.narcotique|pas\s+(un\s+)?stup[ée]fiant)\b/i.test(question);
  const isHospital    = intents.includes('HOSPITAL') && /\bh[ôo]pital\b/i.test(question);
  const isOfficine    = intents.includes('HOSPITAL') && /\bofficine\b/i.test(question);

  const hasCombinedSearch = detectedForm && termWithoutForm.length >= 2;
  const hasFilterSearch   = (isHospital || isOfficine || isNonNarcotic) && term.length >= 2;

  if (hasCombinedSearch || hasFilterSearch) {
    const combinedResults = await pharma.searchCombined({
      term:       hasCombinedSearch ? termWithoutForm : term,
      formFilter: detectedForm || null,
      narcotic:   isNonNarcotic ? false : undefined,
      hosp:       isHospital    ? true  : undefined,
      amb:        isOfficine    ? true  : undefined,
    });
    if (combinedResults.length > 0) {
      const displayTerm = hasCombinedSearch ? termWithoutForm : term;
      const formLabel   = detectedForm ? ` en ${detectedForm}` : '';
      const combinedOpts = {
        term:       hasCombinedSearch ? termWithoutForm : term,
        formFilter: detectedForm || null,
        narcotic:   isNonNarcotic ? false : undefined,
        hosp:       isHospital    ? true  : undefined,
        amb:        isOfficine    ? true  : undefined,
      };
      return {
        type:       'list',
        title:      `🔍 Recherche combinée: "${displayTerm}"${formLabel} (${combinedResults.length} résultat(s))`,
        items:      combinedResults.map(formatMedicineResult),
        raw:        combinedResults,
        searchType: 'combined',
        lastSearch: { type: 'combined', combinedOpts, offset: 0 }
      };
    }
  }

  // Search by galenic form (forme seule, sans terme de médicament spécifique)
  if (intents.includes('SEARCH_FORM') && term.length >= 3) {
    const formTerms = ['comprimé', 'gélule', 'injection', 'sirop', 'crème', 'pommade', 'spray', 'patch', 'suppositoire'];
    for (const ft of formTerms) {
      if (questionLower.includes(ft)) {
        const results = await pharma.searchByGalenicForm(ft, 10);
        if (results.length > 0) {
          return {
            type:       'list',
            title:      `💊 Médicaments en "${ft}" (${results.length} résultat(s))`,
            items:      results.map(r => `💊 **${r.mpnm}** - ${r.forme} (${r.nb_presentations} présentations)`),
            raw:        results,
            searchType: 'form'
          };
        }
      }
    }
  }

  // Default: search by medicine name
  if (term.length >= 2) {
    const results = await pharma.searchByMedicineName(term, 10);
    
    if (results.length === 0) {
      // Try active substance as fallback
      const substanceResults = await pharma.searchByActiveSubstance(term, 5);
      if (substanceResults.length > 0) {
        return {
          type: 'list',
          title: `🔬 Substances actives trouvées pour "${term}"`,
          items: substanceResults.map(formatSubstanceResult),
          raw: substanceResults,
          searchType: 'substance'
        };
      }
      // Suggestions Levenshtein si aucun résultat trouvé
      const suggestions = await suggestCorrections(term);
      const suggestionLine = suggestions.length > 0
        ? `\n\n💡 Vouliez-vous dire: **${suggestions.join('**, **')}** ?`
        : '';
      return {
        type: 'empty',
        text: `Aucun médicament trouvé pour "${term}".${suggestionLine}\n\nEssayez:\n• Un autre nom de marque\n• La substance active (ex: "ibuprofène")\n• L'indication (ex: "douleur", "fièvre")`
      };
    }

    if (results.length === 1) {
      // Get full details for single result
      const detail = await pharma.getMedicamentDetails(results[0].mpcv);
      return {
        type: 'detail',
        title: `💊 ${results[0].mpnm}`,
        data: detail,
        text: formatDetailedResponse(detail)
      };
    }

    return {
      type:       'list',
      title:      `💊 Médicaments trouvés pour "${term}" (${results.length} résultat(s))`,
      items:      results.map(formatMedicineResult),
      raw:        results,
      searchType: 'medicine',
      lastSearch: { type: 'medicine', term, offset: 0 }
    };
  }

  return {
    type: 'help',
    text: `Je n'ai pas bien compris votre question. Veuillez préciser le nom du médicament ou la substance active que vous recherchez.`
  };
}

function formatDetailedResponse(detail) {
  if (!detail) return 'Médicament introuvable.';
  
  let text = `# 💊 ${detail.mpnm}\n\n`;
  if (detail.indication) text += `**Indication thérapeutique:** ${detail.indication}\n`;
  if (detail.categorie)  text += `**Catégorie:** ${detail.categorie}\n`;

  // hyr.intro: description clinique du groupe thérapeutique (limitée à 400 caractères)
  if (detail.hyr_intro) {
    const intro = detail.hyr_intro.length > 400
      ? detail.hyr_intro.substring(0, 400) + '...'
      : detail.hyr_intro;
    text += `\n📖 **À propos de cette catégorie:**\n${intro}\n`;
  }
  text += '\n';
  
  const props = [];
  if (detail.narcotic) props.push('⚠️ **STUPÉFIANT** - Réglementation stricte');
  if (detail.orphan)   props.push('🔬 **Médicament orphelin**');
  if (detail.bt)       props.push('🧬 **Biosimilaire**');
  if (detail.specrules) props.push('📜 **Règles spéciales d\'autorisation**');
  if (detail.gdkp)     props.push('🔒 Usage limité aux médecins spécialistes');
  
  if (props.length) text += props.join('\n') + '\n\n';
  
  if (detail.hosp && !detail.amb) text += '🏥 **Disponibilité:** Hospitalier uniquement\n';
  else if (detail.amb && !detail.hosp) text += '🏪 **Disponibilité:** Officine\n';
  else if (detail.amb && detail.hosp) text += '✅ **Disponibilité:** Officine et hospitalier\n';
  
  if (detail.note) text += `\n📝 **Note:** ${detail.note}\n`;
  
  if (detail.compositions && detail.compositions.length > 0) {
    text += `\n**🔬 Composition:**\n`;
    for (const comp of detail.compositions.slice(0, 5)) {
      text += `  • ${comp.substance_fr || comp.substance_nl}: ${comp.inq} ${comp.inu || ''}\n`;
    }
  }
  
  if (detail.presentations && detail.presentations.length > 0) {
    text += `\n**📦 Présentations disponibles:**\n`;
    for (const pres of detail.presentations.slice(0, 5)) {
      const price = pres.pupr ? `${parseFloat(pres.pupr).toFixed(2)} €` : 'N/A';
      text += `  • ${pres.mppnm} — ${pres.forme_galenique || ''} — ${price}\n`;
    }
    if (detail.presentations.length > 5) {
      text += `  _...et ${detail.presentations.length - 5} autre(s) présentation(s)_\n`;
    }
  }
  
  return text;
}

module.exports = { processQuestion, formatDetailedResponse };

