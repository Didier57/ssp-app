const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { parseLicenseTsv, parseLicenseXlsx, col, parseDate } = require('../license-parser');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

function normSiel(s) {
  return String(s || '').replace(/\s+/g, '').replace(/^SID:/i, '');
}

function int(s) {
  const n = parseInt(String(s || '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function txt(v) {
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim() || null;
}

function customerLookup() {
  const customers = db.prepare(
    'SELECT id, customer, customer_site, siel_id, number_user, contract, udl_contract, dlu_contract FROM customers'
  ).all();
  const bySiel = new Map();
  for (const c of customers) {
    const k = normSiel(c.siel_id).toUpperCase();
    if (k) bySiel.set(k, c);
  }
  return bySiel;
}

function cleanId(v) {
  return String(v || '').replace(/\.0+$/, '');
}

function rowKeyFromParts(lid, lac, sielNorm, feature, qty, createDate) {
  if (lid) return 'L:' + lid;
  return `C:${lac || ''}|${sielNorm || ''}|${feature || ''}|${qty || 0}|${createDate || ''}`;
}

function rowKey(row) {
  const lid = txt(col(row, 'License ID'));
  if (lid) return 'L:' + cleanId(lid);
  return rowKeyFromParts(
    null,
    txt(col(row, 'LAC')),
    normSiel(txt(col(row, 'SIEL-ID'))),
    txt(col(row, 'Feature #')),
    int(col(row, 'Total Quantity')),
    parseDate(col(row, 'Create Date'))
  );
}

router.post('/import', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  try {
    const lower = String(req.file.originalname || '').toLowerCase();
    const parsed = lower.endsWith('.xlsx')
      ? parseLicenseXlsx(req.file.buffer)
      : parseLicenseTsv(req.file.buffer);
    if (!parsed.rows.length) return res.status(400).json({ error: 'Fichier vide ou illisible.' });
    if (!parsed.rows[0]._idx || !('lac' in parsed.rows[0]._idx) || !('siel-id' in parsed.rows[0]._idx)) {
      return res.status(400).json({ error: 'Format non reconnu : colonnes "LAC" / "SIEL-ID" absentes.' });
    }
    const bySiel = customerLookup();
    let matched = 0;
    const lacs = new Set();
    let skipped = 0;
    const existing = new Set();
    for (const r of db.prepare(
      'SELECT license_id, lac, siel_norm, feature, total_quantity, create_date FROM licenses'
    ).all()) {
      existing.add(rowKeyFromParts(cleanId(r.license_id), r.lac, r.siel_norm, r.feature, r.total_quantity, r.create_date));
    }
    const tx = db.transaction(() => {
      const ins = db.prepare(`
        INSERT INTO licenses (
          lac, feature, feature_name_code, create_date, total_quantity, available_quantity,
          siel_id, siel_norm, registered_company, license_id, sales_order, delivery_note,
          purchase_order, license_mode, status_code
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      for (const r of parsed.rows) {
        const lac = txt(col(r, 'LAC'));
        const sielRaw = txt(col(r, 'SIEL-ID'));
        const sielNorm = normSiel(sielRaw);
        const cust = sielNorm ? bySiel.get(sielNorm.toUpperCase()) : undefined;
        if (cust) matched++;
        if (lac) lacs.add(lac);
        const key = rowKey(r);
        if (existing.has(key)) { skipped++; continue; }
        ins.run(
          lac,
          txt(col(r, 'Feature #')),
          txt(col(r, 'Feature Name Code')),
          parseDate(col(r, 'Create Date')),
          int(col(r, 'Total Quantity')),
          int(col(r, 'Available Quantity')),
          sielRaw,
          sielNorm || null,
          txt(col(r, 'Registered Company')),
          cleanId(txt(col(r, 'License ID'))),
          txt(col(r, 'Sales Order #')),
          txt(col(r, 'Delivery Note #')),
          txt(col(r, 'Purchase Order #')),
          txt(col(r, 'License Mode')),
          txt(col(r, 'Status Code')) || txt(col(r, 'Status'))
        );
        existing.add(key);
      }
    });
    tx();
    const added = parsed.rows.length - skipped;
    logAudit({
      user: req.user,
      action: 'Import de licences',
      category: 'license',
      target: `Fichier « ${req.file.originalname} »`,
      detail: `${added} ajoutée(s), ${skipped} ignorée(s), ${matched} SIEL retrouvé(s), ${lacs.size} LAC`
    });
    res.json({ ok: true, count: added, skipped, matched, lacs: lacs.size });
  } catch (e) {
    res.status(400).json({ error: `Import impossible : ${e.message}` });
  }
});

router.get('/lacs', (req, res) => {
  const rows = db.prepare(`
    SELECT lac, COUNT(*) AS n, SUM(total_quantity) AS users, MAX(create_date) AS last_act
    FROM licenses WHERE lac IS NOT NULL AND lac != ''
    GROUP BY lac
    ORDER BY MAX(create_date) IS NULL, MAX(create_date) ASC
  `).all();
  res.json(rows);
});

router.get('/rows', (req, res) => {
  const lac = String(req.query.lac || '').trim();
  if (!lac) return res.json([]);
  const rows = db.prepare(
    'SELECT * FROM licenses WHERE lac = ? ORDER BY total_quantity DESC, feature ASC'
  ).all(lac);
  const bySiel = customerLookup();
  res.json(rows.map((l) => {
    const cust = l.siel_norm ? bySiel.get(l.siel_norm.toUpperCase()) : undefined;
    return {
      ...l,
      customer: cust ? cust.customer : null,
      customer_site: cust ? cust.customer_site : null,
      udl_contract: cust ? cust.udl_contract : null,
      dlu_contract: cust ? cust.dlu_contract : null,
      siel_display: cust ? cust.siel_id : l.siel_id,
    };
  }));
});

router.delete('/rows/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const row = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Ligne introuvable' });
  db.prepare('DELETE FROM licenses WHERE id = ?').run(id);
  logAudit({
    user: req.user,
    action: 'Suppression d\'une ligne licence',
    category: 'license',
    target: row.lac || 'sans LAC',
    detail: `${row.feature || row.feature_name_code || ''} · ${row.siel_norm || row.siel_id || ''} · qty ${row.total_quantity}`.trim()
  });
  res.json({ ok: true });
});

module.exports = router;