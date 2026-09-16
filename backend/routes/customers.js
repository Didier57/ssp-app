const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { logAudit } = require('../audit');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Normalise une MAC (ex: "001AE8C61926", "00:1A:E8...", "00-1a-e8...") en "00-1A-E8-C6-19-26"
function normalizeMac(s) {
  const clean = String(s || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  if (clean.length !== 12) return '';
  return clean.replace(/(.{2})(?=.)/g, '$1-');
}

// Extrait une adresse MAC d'un nom de fichier
// (séparée par :, - ou _, ou 12 hex sans séparateur)
function extractMac(text) {
  const t = String(text || '').toUpperCase();
  const separated = t.match(/([0-9A-F]{2}([:_\-])[0-9A-F]{2}\2[0-9A-F]{2}\2[0-9A-F]{2}\2[0-9A-F]{2}\2[0-9A-F]{2})/);
  if (separated) return separated[1];
  const plain = t.match(/(?<![0-9A-F])[0-9A-F]{12}(?![0-9A-F])/);
  if (plain) return plain[0];
  return null;
}

router.use(requireAuth);

// GET /api/customers - liste avec filtres
router.get('/', (req, res) => {
  const { search, product, contract, expiring } = req.query;
  let sql = `SELECT c.*, (SELECT COUNT(*) FROM customer_files f WHERE f.customer_id = c.id AND f.content IS NOT NULL AND length(f.content) > 0) AS file_count
             FROM customers c WHERE 1=1`;
  const params = [];

  if (search) {
    sql += ' AND (c.customer LIKE ? OR c.customer_site LIKE ? OR c.mac_address LIKE ? OR c.siel_id LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (product) {
    sql += ' AND c.product LIKE ?';
    params.push(`%${product}%`);
  }
  if (contract !== undefined && contract !== '') {
    sql += ' AND c.contract = ?';
    params.push(Number(contract));
  }
  if (expiring === 'true') {
    sql += ` AND c.date_end_licence IS NOT NULL AND c.date_end_licence != ''
             AND date(c.date_end_licence) BETWEEN date('now') AND date('now', '+90 days')`;
  }

  sql += ' ORDER BY c.customer COLLATE NOCASE ASC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// GET /api/customers/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Client introuvable' });
  res.json(row);
});

// POST /api/customers - ajouter
router.post('/', requireAdmin, (req, res) => {
  const allowed = [
    'customer','customer_site','date_end_licence','product','mac_address','lic_35','siel_id',
    'registered_company','number_user','contract','last_lac','date_last_lac',
    'udl_contract','dlu_contract','info_divers'
  ];
  const data = {};
  for (const k of allowed) data[k] = req.body[k] ?? null;
  data.updated_at = new Date().toISOString();
  data.updated_by = req.user.username;

  const cols = [...allowed, 'updated_at', 'updated_by'];
  const placeholders = cols.map((c) => `@${c}`).join(', ');
  const values = {};
  for (const c of cols) values[c] = data[c];

  const info = db.prepare(
    `INSERT INTO customers (${cols.join(', ')}) VALUES (${placeholders})`
  ).run(values);

  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
  logAudit({
    user: req.user,
    action: 'Ajout d\'un client',
    category: 'customer',
    target: row.customer || `client #${row.id}`,
    detail: row.product || null
  });
  res.status(201).json(row);
});

// PUT /api/customers/:id - modifier
router.put('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Client introuvable' });

  const allowed = [
    'customer','customer_site','date_end_licence','product','mac_address','lic_35','siel_id',
    'registered_company','number_user','contract','last_lac','date_last_lac',
    'udl_contract','dlu_contract','info_divers'
  ];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(req.body[k] ?? null);
    }
  }
  const changed = allowed.filter(
    (k) => req.body[k] !== undefined && String(req.body[k] ?? '') !== String(existing[k] ?? '')
  );
  sets.push('updated_at = ?');
  sets.push('updated_by = ?');
  params.push(new Date().toISOString(), req.user.username, req.params.id);

  db.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  logAudit({
    user: req.user,
    action: 'Modification d\'un client',
    category: 'customer',
    target: existing.customer || `client #${existing.id}`,
    detail: changed.length ? changed.map((k) => k.replace(/_/g, ' ')).join(', ') : null
  });
  res.json(row);
});

// DELETE /api/customers/:id
router.delete('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Client introuvable' });
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  logAudit({
    user: req.user,
    action: 'Suppression d\'un client',
    category: 'customer',
    target: existing.customer || `client #${existing.id}`,
    detail: existing.product || null
  });
  res.json({ ok: true });
});

// ==== Fichiers licence par client ====

// GET /api/customers/:id/files - liste des fichiers du client
router.get('/:id/files', (req, res) => {
  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Client introuvable' });
  const rows = db.prepare(
    `SELECT id, filename, mac_address, size, uploaded_at, uploaded_by
     FROM customer_files
     WHERE customer_id = ? AND content IS NOT NULL AND length(content) > 0
     ORDER BY uploaded_at DESC, id DESC`
  ).all(customer.id);
  res.json(rows);
});

// POST /api/customers/:id/files - upload drag & drop (vérifie la MAC du nom de fichier)
router.post('/:id/files', upload.single('file'), (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Client introuvable' });
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  if (!customer.mac_address) return res.status(400).json({ error: "Ce client n'a pas de MAC renseignée" });

  const fileMacRaw = extractMac(req.file.originalname);
  if (!fileMacRaw) {
    return res.status(400).json({ error: `Impossible d'extraire une adresse MAC du nom « ${req.file.originalname} »` });
  }
  const fileMac = normalizeMac(fileMacRaw);
  const customerMac = normalizeMac(customer.mac_address);
  if (fileMac !== customerMac) {
    return res.status(400).json({
      error: `MAC du fichier (${fileMac}) != MAC du client (${customer.mac_address})`
    });
  }

  const info = db.prepare(
    `INSERT INTO customer_files (customer_id, filename, mac_address, content, size, uploaded_at, uploaded_by)
     VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`
  ).run(customer.id, req.file.originalname, fileMac, req.file.buffer, req.file.size, req.user.username);

  const row = db.prepare(
    `SELECT id, customer_id, filename, mac_address, size, uploaded_at, uploaded_by
     FROM customer_files WHERE id = ?`
  ).get(info.lastInsertRowid);
  logAudit({
    user: req.user,
    action: 'Ajout de fichier',
    category: 'file',
    target: customer.customer || `client #${customer.id}`,
    detail: `${row.filename} (${(row.size / 1024).toFixed(1)} Ko)`
  });
  res.status(201).json(row);
});

// GET /api/customers/:id/files/:fileId/download - téléchargement
router.get('/:id/files/:fileId/download', (req, res) => {
  const row = db.prepare(
    'SELECT filename, content FROM customer_files WHERE id = ? AND customer_id = ? AND content IS NOT NULL AND length(content) > 0'
  ).get(req.params.fileId, req.params.id);
  if (!row) return res.status(404).json({ error: 'Fichier introuvable ou vide (0 Ko)' });
  logAudit({ user: req.user, action: 'Téléchargement de fichier', category: 'file', target: row.filename });
  res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(row.content);
});

// DELETE /api/customers/:id/files/:fileId - suppression (admin)
router.delete('/:id/files/:fileId', requireAdmin, (req, res) => {
  const file = db.prepare(
    'SELECT f.*, c.customer FROM customer_files f JOIN customers c ON c.id = f.customer_id WHERE f.id = ? AND f.customer_id = ?'
  ).get(req.params.fileId, req.params.id);
  if (!file) return res.status(404).json({ error: 'Fichier introuvable' });
  db.prepare('DELETE FROM customer_files WHERE id = ? AND customer_id = ?').run(req.params.fileId, req.params.id);
  logAudit({
    user: req.user,
    action: 'Suppression de fichier',
    category: 'file',
    target: file.customer || `client #${file.customer_id}`,
    detail: file.filename
  });
  res.json({ ok: true });
});

module.exports = router;
