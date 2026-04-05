const { query } = require('../config/database');

/**
 * Service de recherche pharmaceutique belge
 * Navigue dans la hiérarchie: innm → mp → mpp → gal / sam / hyr / ir
 */

// Sous-requêtes réutilisables pour le prix minimum et la forme principale par médicament.
// Utilisées dans searchByMedicineName, searchByDisease et searchCombined.
const PRICE_SUBQUERIES = `
  (SELECT MIN(mpp2.pupr)  FROM mpp mpp2 WHERE mpp2.mpcv = mp.mpcv) AS prix_min,
  (SELECT gal2.fgalnm
   FROM mpp mpp2 JOIN gal gal2 ON gal2.galcv = mpp2.galcv
   WHERE mpp2.mpcv = mp.mpcv ORDER BY mpp2.pupr ASC LIMIT 1)       AS forme_principale`;

async function searchByMedicineName(term, limit = 10, offset = 0) {
  // Essai FULLTEXT BOOLEAN MODE d'abord (prefix matching: term*)
  if (term.length >= 3) {
    try {
      const ftRows = await query(
        `SELECT mp.mpcv, mp.mpnm, mp.narcotic, mp.orphan, mp.specrules, mp.bt,
                mp.amb, mp.hosp, mp.note, mp.pos,
                ir.firnm as indication, ir.nirnm as indication_nl,
                hyr.ti as categorie, hyr.hyr as hyr_code,
                ${PRICE_SUBQUERIES},
                MATCH(mp.mpnm) AGAINST(? IN BOOLEAN MODE) AS relevance
         FROM mp
         LEFT JOIN ir  ON ir.ircv   = mp.ircv
         LEFT JOIN hyr ON hyr.hyrcv = mp.hyrcv
         WHERE MATCH(mp.mpnm) AGAINST(? IN BOOLEAN MODE)
         ORDER BY relevance DESC, mp.mpnm ASC
         LIMIT ? OFFSET ?`,
        [`${term}*`, `${term}*`, limit, offset]
      );
      if (ftRows.length > 0) return ftRows;
    } catch (e) {
      // Index FULLTEXT absent (avant migration) → fallback LIKE
    }
  }
  // Fallback: LIKE classique (substring)
  const like = `%${term}%`;
  return query(
    `SELECT mp.mpcv, mp.mpnm, mp.narcotic, mp.orphan, mp.specrules, mp.bt,
            mp.amb, mp.hosp, mp.note, mp.pos,
            ir.firnm as indication, ir.nirnm as indication_nl,
            hyr.ti as categorie, hyr.hyr as hyr_code,
            ${PRICE_SUBQUERIES}
     FROM mp
     LEFT JOIN ir  ON ir.ircv   = mp.ircv
     LEFT JOIN hyr ON hyr.hyrcv = mp.hyrcv
     WHERE mp.mpnm LIKE ?
     ORDER BY mp.mpnm ASC
     LIMIT ? OFFSET ?`,
    [like, limit, offset]
  );
}

async function searchByActiveSubstance(term, limit = 10) {
  // Essai FULLTEXT BOOLEAN MODE d'abord sur les trois colonnes de noms
  if (term.length >= 3) {
    try {
      const ftRows = await query(
        `SELECT innm.stofcv, innm.finnm as substance_fr, innm.ninnm as substance_nl,
                innm.fbase, innm.nbase, innm.amb, innm.hosp,
                COUNT(DISTINCT sam.mppcv) as nb_medicaments,
                MATCH(innm.finnm, innm.ninnm, innm.fbase) AGAINST(? IN BOOLEAN MODE) AS relevance
         FROM innm
         LEFT JOIN sam ON sam.stofcv = innm.stofcv
         WHERE MATCH(innm.finnm, innm.ninnm, innm.fbase) AGAINST(? IN BOOLEAN MODE)
         GROUP BY innm.stofcv
         ORDER BY relevance DESC, innm.finnm ASC
         LIMIT ?`,
        [`${term}*`, `${term}*`, limit]
      );
      if (ftRows.length > 0) return ftRows;
    } catch (e) {
      // Index FULLTEXT absent → fallback LIKE
    }
  }
  // Fallback: LIKE sur les trois colonnes
  const like = `%${term}%`;
  return query(
    `SELECT innm.stofcv, innm.finnm as substance_fr, innm.ninnm as substance_nl,
            innm.fbase, innm.nbase, innm.amb, innm.hosp,
            COUNT(DISTINCT sam.mppcv) as nb_medicaments
     FROM innm
     LEFT JOIN sam ON sam.stofcv = innm.stofcv
     WHERE innm.finnm LIKE ? OR innm.ninnm LIKE ? OR innm.fbase LIKE ?
     GROUP BY innm.stofcv
     ORDER BY innm.finnm ASC
     LIMIT ?`,
    [like, like, like, limit]
  );
}

async function getMedicamentDetails(mpcv) {
  const [mp] = await query(
    `SELECT mp.*, ir.firnm as indication, ir.nirnm as indication_nl,
            hyr.ti as categorie, hyr.intro as hyr_intro
     FROM mp
     LEFT JOIN ir ON ir.ircv = mp.ircv
     LEFT JOIN hyr ON hyr.hyrcv = mp.hyrcv
     WHERE mp.mpcv = ?`,
    [mpcv]
  );
  if (!mp) return null;

  const presentations = await query(
    `SELECT mpp.*, gal.fgalnm as forme_galenique, gal.ngalnm as forme_galenique_nl
     FROM mpp
     LEFT JOIN gal ON gal.galcv = mpp.galcv
     WHERE mpp.mpcv = ?
     ORDER BY mpp.pupr ASC`,
    [mpcv]
  );

  const compositions = await query(
    `SELECT sam.*, innm.finnm as substance_fr, innm.ninnm as substance_nl
     FROM sam
     JOIN innm ON innm.stofcv = sam.stofcv
     WHERE sam.mpcv_ = ?
     ORDER BY sam.inrank ASC`,
    [mpcv]
  );

  return { ...mp, presentations, compositions };
}

async function searchByIndication(term, limit = 10) {
  const like = `%${term}%`;
  return query(
    `SELECT mp.mpcv, mp.mpnm, mp.narcotic, mp.orphan, mp.bt,
            ir.firnm as indication, ir.nirnm as indication_nl
     FROM mp
     JOIN ir ON ir.ircv = mp.ircv
     WHERE ir.firnm LIKE ? OR ir.nirnm LIKE ?
     ORDER BY mp.mpnm ASC
     LIMIT ?`,
    [like, like, limit]
  );
}

async function searchByGalenicForm(term, limit = 10) {
  const like = `%${term}%`;
  return query(
    `SELECT DISTINCT mp.mpcv, mp.mpnm, gal.fgalnm as forme, gal.ngalnm as forme_nl,
            COUNT(mpp.mppcv) as nb_presentations
     FROM mpp
     JOIN gal ON gal.galcv = mpp.galcv
     JOIN mp ON mp.mpcv = mpp.mpcv
     WHERE gal.fgalnm LIKE ? OR gal.ngalnm LIKE ?
     GROUP BY mp.mpcv
     ORDER BY mp.mpnm ASC
     LIMIT ?`,
    [like, like, limit]
  );
}

async function searchNarcotics(limit = 20) {
  return query(
    `SELECT mp.mpcv, mp.mpnm, ir.firnm as indication
     FROM mp
     LEFT JOIN ir ON ir.ircv = mp.ircv
     WHERE mp.narcotic = 1
     ORDER BY mp.mpnm ASC
     LIMIT ?`,
    [limit]
  );
}

async function searchOrphanDrugs(limit = 20) {
  return query(
    `SELECT mp.mpcv, mp.mpnm, ir.firnm as indication
     FROM mp
     LEFT JOIN ir ON ir.ircv = mp.ircv
     WHERE mp.orphan = 1
     ORDER BY mp.mpnm ASC
     LIMIT ?`,
    [limit]
  );
}

async function searchBiosimilars(limit = 20) {
  return query(
    `SELECT mp.mpcv, mp.mpnm, ir.firnm as indication
     FROM mp
     LEFT JOIN ir ON ir.ircv = mp.ircv
     WHERE mp.bt = 1
     ORDER BY mp.mpnm ASC
     LIMIT ?`,
    [limit]
  );
}

/**
 * Retourne toutes les présentations (boîtes) disponibles pour un médicament,
 * triées par prix croissant.
 *
 * @param {string} mpcv - Code du médicament (mp.mpcv), PAS le code de présentation (mpp.mppcv)
 * @returns {Promise<Array<{mppcv, mppnm, pupr, cheapest, forme}>>}
 */
async function getCheapestAlternatives(mpcv) {
  return query(
    `SELECT mpp.mppcv, mpp.mppnm, mpp.pupr, mpp.cheapest,
            gal.fgalnm as forme
     FROM mpp
     JOIN gal ON gal.galcv = mpp.galcv
     WHERE mpp.mpcv = ?
     ORDER BY mpp.pupr ASC
     LIMIT 10`,
    [mpcv]
  );
}

async function getStats() {
  const [mpCount] = await query('SELECT COUNT(*) as cnt FROM mp');
  const [mppCount] = await query('SELECT COUNT(*) as cnt FROM mpp');
  const [innmCount] = await query('SELECT COUNT(*) as cnt FROM innm');
  const [galCount] = await query('SELECT COUNT(*) as cnt FROM gal');
  return {
    medicaments: mpCount.cnt,
    presentations: mppCount.cnt,
    substances: innmCount.cnt,
    formes: galCount.cnt
  };
}

/**
 * Recherche combinée multi-critères: nom + forme galénique + filtres (narcotique, orphelin, hospitalier).
 * Construit dynamiquement la clause WHERE selon les options fournies.
 * @param {object} opts
 * @param {string}  opts.term        - Terme de recherche sur mp.mpnm ou ir.firnm
 * @param {string}  opts.formFilter  - Forme galénique (ex: 'sirop', 'comprimé')
 * @param {boolean} opts.narcotic    - true=stupéfiants, false=non-stupéfiants, undefined=tous
 * @param {boolean} opts.orphan      - true=médicaments orphelins uniquement
 * @param {boolean} opts.hosp        - true=usage hospitalier uniquement
 * @param {boolean} opts.amb         - true=disponible en officine
 * @param {number}  limit
 */
async function searchCombined({ term, formFilter, narcotic, orphan, hosp, amb } = {}, limit = 10, offset = 0) {
  let sql = `
    SELECT DISTINCT mp.mpcv, mp.mpnm, mp.narcotic, mp.orphan, mp.specrules, mp.bt,
           mp.amb, mp.hosp, mp.note, mp.pos,
           ir.firnm  AS indication,  ir.nirnm AS indication_nl,
           hyr.ti    AS categorie,   hyr.hyr  AS hyr_code,
           gal.fgalnm AS forme_galenique,
           ${PRICE_SUBQUERIES}
    FROM mp
    LEFT JOIN ir  ON ir.ircv   = mp.ircv
    LEFT JOIN hyr ON hyr.hyrcv = mp.hyrcv
    LEFT JOIN mpp ON mpp.mpcv  = mp.mpcv
    LEFT JOIN gal ON gal.galcv = mpp.galcv
    WHERE 1=1
  `;
  const params = [];

  if (term && term.length >= 2) {
    sql += ' AND (mp.mpnm LIKE ? OR ir.firnm LIKE ?)';
    params.push(`%${term}%`, `%${term}%`);
  }
  if (formFilter) {
    sql += ' AND (gal.fgalnm LIKE ? OR gal.ngalnm LIKE ?)';
    params.push(`%${formFilter}%`, `%${formFilter}%`);
  }
  if (narcotic === true)  sql += ' AND mp.narcotic = 1';
  if (narcotic === false) sql += ' AND mp.narcotic = 0';
  if (orphan  === true)   sql += ' AND mp.orphan = 1';
  if (hosp    === true)   sql += ' AND mp.hosp = 1';
  if (amb     === true)   sql += ' AND mp.amb = 1';

  sql += ' ORDER BY mp.mpnm ASC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return query(sql, params);
}

/**
 * Recherche rapide pour l'autocomplétion — prefix match sur mp.mpnm.
 * Utilise LIKE 'term%' (préfixe) pour profiter des index B-tree et réduire la latence.
 * @param {string} term  - Préfixe saisi par l'utilisateur (min 2 caractères)
 * @param {number} limit - Nombre max de suggestions (défaut: 8)
 * @returns {Promise<Array<{mpcv: string, mpnm: string}>>}
 */
async function searchAutocomplete(term, limit = 8) {
  return query(
    'SELECT mpcv, mpnm FROM mp WHERE mpnm LIKE ? ORDER BY mpnm ASC LIMIT ?',
    [`${term}%`, limit]
  );
}

/**
 * Recherche par maladie/symptôme via une liste de mots-clés SAM.
 * Interroge simultanément trois sources de données:
 *   - ir.firnm  : classification thérapeutique SAM (ex: "Médicaments antidiabétiques")
 *   - hyr.ti    : titre du groupe thérapeutique (ex: "Cardiovasculaire")
 *   - innm.finnm: nom français de la substance active (ex: "insuline", "metformine")
 *   - innm.fbase: base de la substance (ex: "metformine")
 *
 * Les keywords sont mis en OR entre eux et en OR entre les colonnes.
 * SELECT DISTINCT garantit qu'un même médicament n'apparaît qu'une fois
 * (la jointure LEFT JOIN sam est en 1:N car un médicament peut avoir plusieurs substances).
 *
 * @param {string[]} keywords - Mots-clés SAM issus du DISEASE_MAP
 * @param {number}   limit    - Nombre max de résultats (défaut: 10)
 * @returns {Promise<Array>}
 */
async function searchByDisease(keywords, limit = 10, offset = 0) {
  if (!keywords || keywords.length === 0) return [];

  // Construit: (ir.firnm LIKE ? OR hyr.ti LIKE ? OR innm.finnm LIKE ? OR innm.fbase LIKE ?)
  // pour chaque keyword, puis joint tout en OR
  const conditions = keywords
    .map(() => '(ir.firnm LIKE ? OR hyr.ti LIKE ? OR innm.finnm LIKE ? OR innm.fbase LIKE ?)')
    .join(' OR ');

  const params = [];
  for (const kw of keywords) {
    const like = `%${kw}%`;
    params.push(like, like, like, like); // 4 colonnes par keyword
  }
  params.push(limit, offset);

  return query(
    `SELECT DISTINCT
            mp.mpcv, mp.mpnm, mp.narcotic, mp.orphan, mp.specrules, mp.bt,
            mp.amb,  mp.hosp, mp.note,     mp.pos,
            ir.firnm  AS indication,    ir.nirnm AS indication_nl,
            hyr.ti    AS categorie,     hyr.hyr  AS hyr_code,
            ${PRICE_SUBQUERIES}
     FROM mp
     LEFT JOIN ir   ON ir.ircv     = mp.ircv
     LEFT JOIN hyr  ON hyr.hyrcv   = mp.hyrcv
     LEFT JOIN sam  ON sam.mpcv_   = mp.mpcv
     LEFT JOIN innm ON innm.stofcv = sam.stofcv
     WHERE ${conditions}
     ORDER BY mp.mpnm ASC
     LIMIT ? OFFSET ?`,
    params
  );
}

module.exports = {
  searchByMedicineName,
  searchByActiveSubstance,
  getMedicamentDetails,
  searchByIndication,
  searchByGalenicForm,
  searchNarcotics,
  searchOrphanDrugs,
  searchBiosimilars,
  getCheapestAlternatives,
  getStats,
  searchCombined,
  searchAutocomplete,
  searchByDisease
};

