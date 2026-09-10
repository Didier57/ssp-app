const XLSX = require('xlsx');
const db = require('./db');

// Tables exportées dans le classeur Excel (un onglet par table).
// - customers, users, last_ssp, par_mois : données métier / comptes
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

// Reconstruit la base à partir du classeur. Remplace le contenu complet des
// tables de sauvegarde (idempotent : rejouable après une erreur).
function importBackup(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const before = summary();
  const originalAdmins = db
    .prepare(`SELECT id, username, password_hash, role, email, created_at FROM users WHERE role = 'admin'`)
    .all();

  const tx = db.transaction(() => {
    for (const t of TABLES) {
      db.prepare(`DELETE FROM ${t.name}`).run();
    }
    for (const t of TABLES) {
      if (!wb.Sheets[t.name]) continue;
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[t.name], { defval: '', raw: false });
      importRows(t.name, rows);
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

module.exports = { buildBackupWorkbook, importBackup, backupFilename, summary };