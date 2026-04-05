const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function createDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    charset: 'utf8mb4'
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'pharmabot'}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${process.env.DB_NAME || 'pharmabot'}\``);
  await conn.end();
  console.log('✅ Base de données créée/vérifiée');
}

async function createAppTables(pool) {
  // Use individual queries with ROW_FORMAT=DYNAMIC to support utf8mb4 keys
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fullname VARCHAR(255) NOT NULL,
      email VARCHAR(191) NOT NULL,
      password VARCHAR(255) NOT NULL,
      profession ENUM('medecin','veterinaire','pharmacien','autre') DEFAULT 'autre',
      role ENUM('user','admin') DEFAULT 'user',
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_email (email)
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4`,

    `CREATE TABLE IF NOT EXISTS subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      plan ENUM('gratuit','bienvenue','professionnel') DEFAULT 'gratuit',
      daily_limit INT DEFAULT 5,
      start_date DATE,
      end_date DATE,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4`,

    `CREATE TABLE IF NOT EXISTS daily_usage (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      session_id VARCHAR(191),
      usage_date DATE NOT NULL,
      question_count INT DEFAULT 0,
      UNIQUE KEY unique_user_date (user_id, usage_date),
      UNIQUE KEY unique_session_date (session_id, usage_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4`,

    `CREATE TABLE IF NOT EXISTS chat_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      session_id VARCHAR(191),
      question TEXT NOT NULL,
      answer TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4`,

    `CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      subscription_id INT,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'EUR',
      payment_method ENUM('stripe','paypal') NOT NULL,
      payment_intent_id VARCHAR(191),
      status ENUM('pending','completed','failed','refunded') DEFAULT 'pending',
      plan VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4`
  ];

  for (const sql of tables) {
    await pool.query(sql);
  }
  console.log('✅ Tables applicatives créées');
}

async function createPharmaTablesMySQL(pool) {
  // Enable large prefix support for utf8mb4 key compatibility
  try {
    await pool.query("SET GLOBAL innodb_large_prefix = ON");
    await pool.query("SET GLOBAL innodb_file_format = Barracuda");
  } catch (e) { /* MySQL 8+ ignores these - fine */ }

  const tables = [
    `CREATE TABLE IF NOT EXISTS gal (
      galcv VARCHAR(100) NOT NULL,
      ngalnm VARCHAR(255),
      fgalnm VARCHAR(255),
      amb TINYINT(1),
      hosp TINYINT(1),
      PRIMARY KEY (galcv)
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4`,

    `CREATE TABLE IF NOT EXISTS hyr (
      hyrcv VARCHAR(100) NOT NULL,
      hyr VARCHAR(100) NOT NULL,
      mpgrp TINYINT(1) NOT NULL DEFAULT 0,
      ti VARCHAR(255),
      intro TEXT,
      pos TEXT,
      PRIMARY KEY (hyrcv)
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4`,

    `CREATE TABLE IF NOT EXISTS ir (
      ircv VARCHAR(100) NOT NULL,
      nirnm VARCHAR(255) NOT NULL,
      firnm VARCHAR(255) NOT NULL,
      pip TINYINT(1),
      amb TINYINT(1),
      hosp TINYINT(1),
      PRIMARY KEY (ircv)
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4`,

    `CREATE TABLE IF NOT EXISTS innm (
      stofcv VARCHAR(100) NOT NULL,
      ninnm VARCHAR(255),
      finnm VARCHAR(255),
      nbase VARCHAR(255),
      ninnmx VARCHAR(255),
      nsaltestr VARCHAR(255),
      fbase VARCHAR(255),
      finnmx VARCHAR(255),
      fsaltestr VARCHAR(255),
      amb TINYINT(1),
      hosp TINYINT(1),
      PRIMARY KEY (stofcv)
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4`,

    `CREATE TABLE IF NOT EXISTS mp (
      mpcv VARCHAR(100) NOT NULL,
      hyrcv VARCHAR(100) NOT NULL,
      hyr_ VARCHAR(100),
      mpnm VARCHAR(255),
      ircv VARCHAR(100) NOT NULL,
      bt TINYINT(1),
      note TEXT,
      pos TEXT,
      wadan VARCHAR(255),
      wadaf VARCHAR(255),
      \`rank\` INT,
      nmcv VARCHAR(100),
      orphan TINYINT(1) NOT NULL DEFAULT 0,
      specrules TINYINT(1) NOT NULL DEFAULT 0,
      narcotic TINYINT(1) NOT NULL DEFAULT 0,
      amb TINYINT(1),
      hosp TINYINT(1),
      PRIMARY KEY (mpcv),
      INDEX idx_mp_hyrcv (hyrcv),
      INDEX idx_mp_ircv (ircv),
      INDEX idx_mp_mpnm (mpnm(100))
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4`,

    `CREATE TABLE IF NOT EXISTS mpp (
      mppcv VARCHAR(100) NOT NULL,
      hyr_ VARCHAR(100),
      hyrcv VARCHAR(100) NOT NULL,
      ogc VARCHAR(100),
      mpcv VARCHAR(100) NOT NULL,
      ouc CHAR(1) NOT NULL,
      mppnm VARCHAR(255) NOT NULL,
      volgnr INT,
      galcv VARCHAR(100) NOT NULL,
      spef VARCHAR(255),
      cq INT,
      cu CHAR(1),
      cfq DECIMAL(12,4),
      cfu VARCHAR(100),
      aq INT,
      au VARCHAR(100),
      afq DECIMAL(12,4) NOT NULL DEFAULT 0,
      afu VARCHAR(100),
      atype VARCHAR(100),
      cmucomb VARCHAR(100),
      law CHAR(1),
      ssecr VARCHAR(100),
      pupr DECIMAL(12,4) NOT NULL DEFAULT 0,
      \`use\` CHAR(1),
      note VARCHAR(255),
      pos VARCHAR(255),
      content_ VARCHAR(255),
      galnm_ VARCHAR(255),
      \`index\` DECIMAL(12,4) NOT NULL DEFAULT 0,
      rema DECIMAL(12,4) NOT NULL DEFAULT 0,
      remw DECIMAL(12,4) NOT NULL DEFAULT 0,
      inncnk VARCHAR(100) NOT NULL,
      vosnm_ VARCHAR(255),
      bt TINYINT(1),
      gdkp TINYINT(1) NOT NULL DEFAULT 0,
      excip VARCHAR(255),
      cheapest TINYINT(1),
      specrules TINYINT(1) NOT NULL DEFAULT 0,
      narcotic TINYINT(1) NOT NULL DEFAULT 0,
      amb TINYINT(1),
      hosp TINYINT(1),
      PRIMARY KEY (mppcv),
      INDEX idx_mpp_mpcv (mpcv),
      INDEX idx_mpp_galcv (galcv),
      INDEX idx_mpp_mppnm (mppnm(100))
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4`,

    `CREATE TABLE IF NOT EXISTS sam (
      mppcv VARCHAR(100) NOT NULL,
      stofcv VARCHAR(100) NOT NULL,
      ppid VARCHAR(100) NOT NULL,
      hyr_ VARCHAR(100) NOT NULL,
      hyrcv_ VARCHAR(100) NOT NULL,
      mpcv_ VARCHAR(100) NOT NULL,
      mppnm_ VARCHAR(255),
      ppq INT,
      ppgal VARCHAR(100),
      inrank INT NOT NULL DEFAULT 0,
      stofnm_ VARCHAR(255),
      dim VARCHAR(100),
      inx VARCHAR(100),
      inq DECIMAL(12,4) NOT NULL DEFAULT 0,
      inu VARCHAR(100),
      \`add\` CHAR(1),
      inbasq DECIMAL(12,4) NOT NULL DEFAULT 0,
      inbasu VARCHAR(100),
      inq2 DECIMAL(12,4) NOT NULL DEFAULT 0,
      inu2 VARCHAR(100),
      amb TINYINT(1),
      hosp TINYINT(1),
      PRIMARY KEY (stofcv, mppcv, ppid),
      INDEX idx_sam_mppcv (mppcv),
      INDEX idx_sam_stofcv (stofcv)
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4`,

    `CREATE TABLE IF NOT EXISTS ggr_link (
      mppcv VARCHAR(100) NOT NULL,
      mppnm_ VARCHAR(255),
      link2mpg VARCHAR(255),
      link2pvt VARCHAR(255),
      PRIMARY KEY (mppcv)
    ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC CHARACTER SET utf8mb4`
  ];

  for (const sql of tables) {
    await pool.query(sql);
  }
  console.log('✅ Tables pharmaceutiques créées');
}

async function importPharmaData(pool) {
  // Check if already fully imported (vérifie gal ET mpp pour détecter un import partiel)
  const [galRows] = await pool.query('SELECT COUNT(*) as cnt FROM gal');
  const [mppRows] = await pool.query('SELECT COUNT(*) as cnt FROM mpp');
  if (galRows[0].cnt > 0 && mppRows[0].cnt > 0) {
    console.log(`✅ Données pharmaceutiques déjà importées (${galRows[0].cnt} formes galéniques, ${mppRows[0].cnt} présentations)`);
    return;
  }
  if (galRows[0].cnt > 0 && mppRows[0].cnt === 0) {
    console.log('⚠️  Import partiel détecté (gal OK, mpp manquant) — ré-import en cours...');
  }

  const sqlFilePath = path.join(__dirname, '..', 'exportFr.sql');
  if (!fs.existsSync(sqlFilePath)) {
    console.warn('⚠️ Fichier exportFr.sql introuvable, import ignoré');
    return;
  }

  console.log('📥 Import des données pharmaceutiques belges en cours...');

  // Normalise les fins de ligne Windows (\r\n → \n) avant le split
  const content = fs.readFileSync(sqlFilePath, 'utf8').replace(/\r\n/g, '\n');
  const lines = content.split('\n');

  // ── Reconstruction des instructions multi-lignes ──────────────────────────
  // Les colonnes TEXT (note, pos, intro) peuvent contenir des sauts de ligne.
  // pg_dump produit alors un INSERT qui s'étend sur plusieurs lignes.
  // On accumule les lignes jusqu'au ';' terminal avant d'exécuter la requête.
  const statements = [];
  let currentStmt = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('INSERT INTO')) {
      // Nouvelle instruction: sauvegarder la précédente si incomplète
      if (currentStmt !== null) statements.push(currentStmt);
      currentStmt = trimmed;
      if (trimmed.endsWith(';')) {
        statements.push(currentStmt);
        currentStmt = null;
      }
    } else if (currentStmt !== null) {
      // Ligne de continuation d'un INSERT multi-lignes (valeur TEXT avec \n)
      currentStmt += '\n' + line;
      if (trimmed.endsWith(';')) {
        statements.push(currentStmt);
        currentStmt = null;
      }
    }
    // Les lignes CREATE TABLE, SET, ALTER, commentaires, etc. sont ignorées
  }
  if (currentStmt !== null) statements.push(currentStmt); // dernier statement

  console.log(`   ${statements.length} instructions INSERT détectées`);

  let insertCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    let stmt = statements[i];

    // ── Conversion PostgreSQL → MySQL ────────────────────────────────────────

    // 1) Booléens PostgreSQL 't'/'f' → entiers MySQL 1/0
    //    Les patterns ciblent les valeurs isolées dans la liste VALUES.
    stmt = stmt
      .replace(/, 't'/g,  ', 1')
      .replace(/, 'f'/g,  ', 0')
      .replace(/'t'\)/g, '1)')
      .replace(/'f'\)/g, '0)')
      .replace(/, 't',/g, ', 1,')
      .replace(/, 'f',/g, ', 0,');

    // 2) Mots réservés MySQL 8.0 dans la liste des colonnes (avant VALUES).
    //    Appliqué uniquement à la partie colonne pour éviter les faux positifs
    //    dans les valeurs textuelles (note, pos, intro...).
    //
    //    Format dans pg_dump (exportFr.sql):
    //      mp  → rank    apparaît SANS guillemets: rank
    //      mpp → use     apparaît SANS guillemets: use
    //      mpp → index   apparaît AVEC guillemets doubles: "index"
    //      sam → add     apparaît AVEC guillemets doubles: "add"
    //
    //    Les guillemets doubles PostgreSQL doivent être remplacés par des
    //    backticks MySQL. Les mots sans guillemets nécessitent l'ajout de backticks.
    const valuesIdx = stmt.indexOf(' VALUES ');
    if (valuesIdx !== -1) {
      const colsPart = stmt.substring(0, valuesIdx)
        // Mots avec guillemets doubles PostgreSQL → backticks MySQL
        .replace(/"index"/g, '`index`')
        .replace(/"add"/g,   '`add`')
        .replace(/"rank"/g,  '`rank`')
        .replace(/"use"/g,   '`use`')
        // Mots sans guillemets (cas restants) → backticks MySQL
        .replace(/\brank\b/gi,  '`rank`')
        .replace(/\buse\b/gi,   '`use`');
      stmt = colsPart + stmt.substring(valuesIdx);
    }

    // 3) INSERT INTO → INSERT IGNORE INTO (évite les erreurs de clé dupliquée)
    stmt = stmt.replace(
      /^INSERT INTO (gal|hyr|ir|innm|mp|mpp|sam|ggr_link)/m,
      'INSERT IGNORE INTO $1'
    );

    // ── Exécution individuelle avec gestion d'erreur par requête ─────────────
    // IMPORTANT: chaque try-catch est INDÉPENDANT — une erreur n'annule pas
    // les requêtes suivantes (contrairement à l'ancienne approche par batch).
    try {
      await pool.query(stmt);
      insertCount++;
    } catch (err) {
      errorCount++;
      if (errorCount <= 5) {
        // Affiche les premières erreurs pour aider au diagnostic
        console.warn(`   ⚠️  Erreur INSERT: ${err.message.substring(0, 150)}`);
      }
    }

    if ((i + 1) % 5000 === 0) {
      console.log(`   ... ${i + 1}/${statements.length} traités (${insertCount} réussis, ${errorCount} erreurs)`);
    }
  }

  console.log(`✅ Import terminé: ${insertCount} enregistrements importés, ${errorCount} erreurs ignorées`);
}

async function addFulltextIndexes(pool) {
  const indexes = [
    { sql: 'ALTER TABLE mp   ADD FULLTEXT INDEX ft_mp_mpnm (mpnm)',               name: 'ft_mp_mpnm'   },
    { sql: 'ALTER TABLE innm ADD FULLTEXT INDEX ft_innm_names (finnm, ninnm, fbase)', name: 'ft_innm_names' },
  ];
  for (const { sql, name } of indexes) {
    try {
      await pool.query(sql);
      console.log(`✅ Index FULLTEXT créé: ${name}`);
    } catch (e) {
      // errno 1061 = ER_DUP_KEYNAME (index already exists) — safe to ignore
      if (e.errno === 1061 || e.code === 'ER_DUP_KEYNAME') {
        console.log(`ℹ️  Index FULLTEXT déjà existant: ${name}`);
      } else {
        console.warn(`⚠️  Impossible de créer l'index ${name}:`, e.message);
      }
    }
  }
}

async function createAdminUser(pool) {
  const bcrypt = require('bcryptjs');
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [process.env.ADMIN_EMAIL || 'admin@pharmabot.be']);
  if (existing.length > 0) {
    console.log('✅ Utilisateur admin déjà existant');
    return;
  }
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@2024!', 12);
  await pool.query(
    'INSERT INTO users (fullname, email, password, profession, role) VALUES (?, ?, ?, ?, ?)',
    ['Administrateur PharmaBot', process.env.ADMIN_EMAIL || 'admin@pharmabot.be', hash, 'pharmacien', 'admin']
  );
  console.log('✅ Compte administrateur créé');
}

async function migrate() {
  console.log('\n🚀 Démarrage des migrations PharmaBot...\n');
  
  await createDatabase();
  
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pharmabot',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    multipleStatements: true
  });

  await createPharmaTablesMySQL(pool);
  await createAppTables(pool);
  await importPharmaData(pool);
  await addFulltextIndexes(pool);
  await createAdminUser(pool);
  
  await pool.end();
  console.log('\n✅ Migrations terminées avec succès!\n');
}

module.exports = { migrate };

