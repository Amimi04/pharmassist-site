const pharma = require('./pharmaSearchService');

/**
 * Moteur de chatbot pharmaceutique belge
 * Analyse sémantique en français des questions médicales/pharmaceutiques
 */

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
};

function detectIntent(text) {
  const intents = [];
  for (const [intent, pattern] of Object.entries(INTENTS)) {
    if (pattern.test(text)) intents.push(intent);
  }
  return intents;
}

function extractSearchTerm(text) {
  // Remove question words and common French phrases
  return text
    .replace(/^(qu'est-ce que|qu'est ce que|quelle est|quels sont|comment|est-ce que|y a-t-il|existe-t-il)\s+/i, '')
    .replace(/\b(le médicament|la substance|les médicaments|les substances|un médicament|une substance)\b/gi, '')
    .replace(/\b(pour|contre|traiter|soigner|utiliser|prendre)\b/gi, '')
    .replace(/[?!.]/g, '')
    .trim();
}

function formatMedicineResult(med) {
  let response = `💊 **${med.mpnm}**\n`;
  if (med.indication) response += `📋 Indication: ${med.indication}\n`;
  if (med.categorie) response += `🏷️ Catégorie: ${med.categorie}\n`;
  
  const badges = [];
  if (med.narcotic) badges.push('⚠️ Stupéfiant');
  if (med.orphan)   badges.push('🔬 Médicament orphelin');
  if (med.bt)       badges.push('🧬 Biosimilaire');
  if (med.hosp && !med.amb) badges.push('🏥 Usage hospitalier uniquement');
  if (med.amb && !med.hosp) badges.push('🏪 Disponible en officine');
  if (med.specrules) badges.push('📜 Règles spéciales d\'autorisation');
  
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

async function processQuestion(question) {
  const intents = detectIntent(question);
  const term = extractSearchTerm(question);
  
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

  // Search by galenic form
  if (intents.includes('SEARCH_FORM') && term.length >= 3) {
    const formTerms = ['comprimé', 'gélule', 'injection', 'sirop', 'crème', 'pommade', 'spray', 'patch', 'suppositoire'];
    for (const ft of formTerms) {
      if (question.toLowerCase().includes(ft)) {
        const results = await pharma.searchByGalenicForm(ft, 10);
        if (results.length > 0) {
          return {
            type: 'list',
            title: `💊 Médicaments en "${ft}" (${results.length} résultat(s))`,
            items: results.map(r => `💊 **${r.mpnm}** - ${r.forme} (${r.nb_presentations} présentations)`),
            raw: results,
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
      return {
        type: 'empty',
        text: `Aucun médicament trouvé pour "${term}".\n\nEssayez:\n• Un autre nom de marque\n• La substance active (ex: "ibuprofène")\n• L'indication (ex: "douleur", "fièvre")`
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
      type: 'list',
      title: `💊 Médicaments trouvés pour "${term}" (${results.length} résultat(s))`,
      items: results.map(formatMedicineResult),
      raw: results,
      searchType: 'medicine'
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
  if (detail.categorie) text += `**Catégorie:** ${detail.categorie}\n\n`;
  
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

