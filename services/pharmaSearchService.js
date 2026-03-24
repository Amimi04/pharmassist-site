const { query } = require('../config/database');

/**
 * Service de recherche pharmaceutique belge
 * Navigue dans la hiérarchie: innm → mp → mpp → gal / sam / hyr / ir
 */

async function searchByMedicineName(term, limit = 10) {
  const like = `%${term}%`;
  const rows = await query(
    `SELECT mp.mpcv, mp.mpnm, mp.narcotic, mp.orphan, mp.specrules, mp.bt,
            mp.amb, mp.hosp, mp.note, mp.pos,
            ir.firnm as indication, ir.nirnm as indication_nl,
            hyr.ti as categorie, hyr.hyr as hyr_code
     FROM mp
     LEFT JOIN ir ON ir.ircv = mp.ircv
     LEFT JOIN hyr ON hyr.hyrcv = mp.hyrcv
     WHERE mp.mpnm LIKE ?
     ORDER BY mp.mpnm ASC
     LIMIT ?`,
    [like, limit]
  );
  return rows;
}

async function searchByActiveSubstance(term, limit = 10) {
  const like = `%${term}%`;
  const rows = await query(
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
  return rows;
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

async function getCheapestAlternatives(mppcv) {
  const [mpp] = await query('SELECT mpcv FROM mpp WHERE mppcv = ?', [mppcv]);
  if (!mpp) return [];
  return query(
    `SELECT mpp.mppcv, mpp.mppnm, mpp.pupr, mpp.cheapest,
            gal.fgalnm as forme
     FROM mpp
     JOIN gal ON gal.galcv = mpp.galcv
     WHERE mpp.mpcv = ?
     ORDER BY mpp.pupr ASC
     LIMIT 10`,
    [mpp.mpcv]
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
  getStats
};

