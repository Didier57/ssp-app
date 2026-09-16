const XLSX = require('xlsx');
const AdmZip = require('adm-zip');
const db = require('./db');

// Tables exportées dans le classeur Excel (un onglet par table).
// - customers, users, last_ssp, par_mois, licenses (Report) : données métier / comptes
// - settings : configuration (SMTP, notifications, dates)
// - reminder_sent : évite de renvoyer les mêmes rappels après restauration
// - customer_files : seulement les métadonnées (le contenu binaire BLOB ne peut
//   pas être stocké dans Excel ; les fichiers de licence ne sont donc PAS
//   restaurables depuis un fichier Excel)
const TABLES = [
  { name: 'customers', exclude: [] },
  { name: 'users', exclude: [] },
  { name: 'last_ssp', exclude: [] },
  { name: 'par_mois', exclude: [] },
  { name: 'licenses', exclude: [] },
  { name: 'settings', exclude: [] },
  { name: 'reminder_sent', exclude: [] },
  { name: 'customer_files', exclude: ['content'] }
];

function tableColumns(name) {
  return db
    .prepare(`PRAGMA table_info(${name})`)
    .all()
    .map((c) => c.name);
}

function summary() {
  const s = {};
  for (const t of TABLES) {
    s[t.name] = db.prepare(`SELECT COUNT(*) AS n FROM ${t.name}`).get().n;
  }
  return s;
}

// Construit le classeur Excel complet (toutes les tables en onglets séparés)
function buildBackupWorkbook() {
  const wb = XLSX.utils.book_new();
  for (const t of TABLES) {
    const columns = tableColumns(t.name).filter((c) => !t.exclude.includes(c));
    const rows = db
      .prepare(`SELECT ${columns.map((c) => `"${c}"`).join(', ')} FROM ${t.name}`)
      .all();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = columns.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, t.name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function importRows(table, rows) {
  if (!rows || !rows.length) return 0;
  const columns = tableColumns(table);
  const keys = Object.keys(rows[0]).filter((k) => columns.includes(k));
  if (!keys.length) return 0;
  const stmt = db.prepare(
    `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  );
  for (const r of rows) {
    stmt.run(...keys.map((k) => (r[k] === undefined || r[k] === '') ? null : r[k]));
  }
  return rows.length;
}

// Réinsère les métadonnées des fichiers de licence en préservant le contenu binaire
// des fichiers qui existent encore. Les références sans contenu (fichiers vides,
// ex. après une ancienne restauration Excel) sont ignorées : la référence est effacée.
function importCustomerFiles(rows, existingFiles) {
  if (!rows || !rows.length) return 0;
  const columns = tableColumns('customer_files').filter((c) => c !== 'content');
  if (!columns.length) return 0;
  const stmt = db.prepare(
    `INSERT INTO customer_files (${columns.map((c) => `"${c}"`).join(', ')}, content)
     VALUES (${columns.map(() => '?').join(', ')}, ?)`
  );
  let inserted = 0;
  for (const r of rows) {
    const content =
      existingFiles.get(`${r.customer_id}|${r.filename}`) ||
      (r.mac_address ? existingFiles.get(`mac|${normalizeMac(r.mac_address)}`) : undefined);
    if (!content) continue;
    const vals = columns.map((c) => {
      if (c === 'size') return content.length;
      return (r[c] === undefined || r[c] === '') ? null : r[c];
    });
    stmt.run(...vals, content);
    inserted++;
  }
  return inserted;
}

// Reconstruit la base à partir du classeur. Remplace le contenu complet des
// tables de sauvegarde (idempotent : rejouable après une erreur).
function importBackup(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const before = summary();
  // Ne restaure que les tables présentes dans le fichier : une ancienne sauvegarde
  // sans onglet (ex. "licenses" avant l'inclusion du Report) ne doit pas vider la table.
  const restore = TABLES.filter((t) => wb.Sheets[t.name]);
  const originalAdmins = db
    .prepare(`SELECT id, username, password_hash, role, email, created_at FROM users WHERE role = 'admin'`)
    .all();

  // Sauvegarde le contenu binaire des fichiers de licence déjà présents : l'Excel ne
  // stocke que les métadonnées, on ne doit donc pas perdre les octets lors de la
  // restauration. Les références sans contenu seront, elles, supprimées.
  const existingFiles = new Map();
  for (const f of db
    .prepare('SELECT customer_id, filename, mac_address, content FROM customer_files WHERE content IS NOT NULL')
    .all()) {
    existingFiles.set(`${f.customer_id}|${f.filename}`, f.content);
    const mac = normalizeMac(f.mac_address);
    if (mac) existingFiles.set(`mac|${mac}`, f.content);
  }

  const tx = db.transaction(() => {
    for (const t of restore) {
      db.prepare(`DELETE FROM ${t.name}`).run();
    }
    for (const t of restore) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[t.name], { defval: '', raw: false });
      if (t.name === 'customer_files') {
        importCustomerFiles(rows, existingFiles);
      } else {
        importRows(t.name, rows);
      }
    }
  });
  tx();

  // Garde-fou : on ne restaure jamais une base sans administrateur.
  const adminsAfter = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all();
  if (!adminsAfter.length && originalAdmins.length) {
    const stmt = db.prepare(
      `INSERT INTO users (id, username, password_hash, role, email, created_at) VALUES (?, ?, ?, 'admin', ?, ?)`
    );
    for (const a of originalAdmins) {
      stmt.run(a.id, a.username, a.password_hash, a.email, a.created_at);
    }
  }

  return { before, after: summary() };
}

function backupFilename() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `ssp_backup_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.xlsx`;
}

// ==== Sauvegarde / restauration SQL (base de données complète) ====

function sqlFilename() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `ssp_database_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.sql`;
}

// Convertit une valeur JS (issue de better-sqlite3) en littéral SQL.
function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (Buffer.isBuffer(v)) return `X'${v.toString('hex')}'`;
  if (typeof v === 'bigint') return String(v);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Génère un dump SQL complet : toutes les tables (DROP + CREATE + INSERT),
// puis les index et triggers. Les BLOB sont sérialisés en littéraux X'...'.
function dumpSql() {
  const tables = db
    .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all();
  const parts = [];
  for (const t of tables) {
    parts.push(`DROP TABLE IF EXISTS "${t.name}";`);
    if (t.sql) parts.push(`${t.sql};`);
    const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all().map((c) => c.name);
    if (!cols.length) continue;
    const rows = db.prepare(`SELECT * FROM "${t.name}"`).all();
    for (const r of rows) {
      const vals = cols.map((c) => sqlValue(r[c]));
      parts.push(`INSERT INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${vals.join(', ')});`);
    }
  }
  for (const i of db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'`)
    .all()) {
    parts.push(`${i.sql};`);
  }
  for (const t of db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL`).all()) {
    parts.push(`${t.sql};`);
  }
  return parts.join('\n');
}

// Reconstruit la base depuis un dump SQL. Remplace l'intégralité des tables
// (transaction : rollback complet en cas d'erreur). Garde-fou admin conservé.
function restoreFromSql(sqlString) {
  const before = summary();
  const originalAdmins = db
    .prepare(`SELECT id, username, password_hash, role, email, created_at FROM users WHERE role = 'admin'`)
    .all();

  db.pragma('foreign_keys = OFF');
  const tx = db.transaction(() => {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .all();
    for (const t of tables) {
      db.prepare(`DROP TABLE IF EXISTS "${t.name}"`).run();
    }
    db.exec(sqlString);
  });
  tx();
  db.pragma('foreign_keys = ON');

  const adminsAfter = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all();
  if (!adminsAfter.length && originalAdmins.length) {
    const stmt = db.prepare(
      `INSERT INTO users (id, username, password_hash, role, email, created_at) VALUES (?, ?, ?, 'admin', ?, ?)`
    );
    for (const a of originalAdmins) {
      stmt.run(a.id, a.username, a.password_hash, a.email, a.created_at);
    }
  }

  return { before, after: summary() };
}

// ==== Fichiers de licence (contenu binaire) ====

// Normalise une MAC (même logique que routes/customers.js) en "00-1A-E8-C6-19-26"
function normalizeMac(s) {
  const clean = String(s || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  if (clean.length !== 12) return '';
  return clean.replace(/(.{2})(?=.)/g, '$1-');
}

function filesZipFilename() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `ssp_licences_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.zip`;
}

// Construit un ZIP contenant tous les fichiers de licence (contenu BLOB) + un manifest.json
function buildFilesZip() {
  const rows = db
    .prepare(
      `SELECT f.id, f.customer_id, f.filename, f.mac_address, f.content, f.size,
              f.uploaded_at, f.uploaded_by, c.customer, c.customer_site
       FROM customer_files f
       LEFT JOIN customers c ON c.id = f.customer_id
       ORDER BY f.id ASC`
    )
    .all();

  const zip = new AdmZip();
  const manifest = rows.map((r, i) => ({
    filename: r.filename,
    customer_id: r.customer_id,
    customer: r.customer || null,
    customer_site: r.customer_site || null,
    mac_address: r.mac_address || null,
    size: r.size,
    uploaded_at: r.uploaded_at,
    uploaded_by: r.uploaded_by || null,
    entry: `licences/${i}`
  }));

  rows.forEach((r, i) => {
    if (r.content != null) zip.addFile(`licences/${i}`, r.content);
  });
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  return zip.toBuffer();
}

// Retrouve le client correspondant à une entrée du manifest (id → MAC → nom+site)
function findCustomerForEntry(m) {
  if (m.customer_id) {
    const c = db.prepare('SELECT id FROM customers WHERE id = ?').get(m.customer_id);
    if (c) return c;
  }
  const mac = normalizeMac(m.mac_address);
  if (mac) {
    const rows = db.prepare('SELECT id, mac_address FROM customers').all();
    const found = rows.find((r) => normalizeMac(r.mac_address) === mac);
    if (found) return found;
  }
  if (m.customer) {
    const c = m.customer_site
      ? db.prepare('SELECT id FROM customers WHERE customer = ? AND customer_site = ?').get(m.customer, m.customer_site)
      : db.prepare('SELECT id FROM customers WHERE customer = ?').get(m.customer);
    if (c) return c;
  }
  return null;
}

// Restaure les fichiers de licence depuis un ZIP (manifest.json + contenus).
// Ajoute les nouveaux fichiers, met à jour le contenu des fichiers déjà présents.
function importFilesZip(buffer) {
  const zip = new AdmZip(buffer);
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) throw new Error('Manifest introuvable dans le ZIP');
  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  } catch (e) {
    throw new Error('Manifest JSON invalide');
  }
  if (!Array.isArray(manifest)) throw new Error('Manifest invalide');

  let added = 0;
  let updated = 0;
  let skipped = 0;
  let missing = 0;

  const tx = db.transaction(() => {
    for (const m of manifest) {
      const customer = findCustomerForEntry(m);
      if (!customer) {
        skipped++;
        continue;
      }
      const content = m.entry ? zip.readFile(m.entry) : null;
      if (!content) {
        missing++;
        continue;
      }
      const existing = db
        .prepare('SELECT id FROM customer_files WHERE customer_id = ? AND filename = ?')
        .get(customer.id, m.filename);
      if (existing) {
        db.prepare(
          'UPDATE customer_files SET content = ?, size = ?, mac_address = ?, uploaded_by = ? WHERE id = ?'
        ).run(content, content.length, m.mac_address || null, m.uploaded_by || null, existing.id);
        updated++;
      } else {
        db.prepare(
          `INSERT INTO customer_files (customer_id, filename, mac_address, content, size, uploaded_at, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          customer.id,
          m.filename,
          m.mac_address || null,
          content,
          content.length,
          m.uploaded_at || null,
          m.uploaded_by || null
        );
        added++;
      }
    }
  });
  tx();

  return { added, updated, skipped, missing, total: manifest.length };
}

module.exports = {
  buildBackupWorkbook,
  importBackup,
  buildFilesZip,
  importFilesZip,
  dumpSql,
  restoreFromSql,
  backupFilename,
  filesZipFilename,
  sqlFilename,
  summary
};