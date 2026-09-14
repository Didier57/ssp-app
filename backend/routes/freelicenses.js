const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { parseLicenseTsv, parseLicenseXlsx, col, parseDate } = require('../license-parser');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

function int(s) {
  const n = parseInt(String(s || '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function txt(v) {
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim() || null;
}

function cleanId(v) {
  return String(v || '').replace(/\.0+$/, '');
}

const SELECT = `
  SELECT id, lac, total_quantity, feature_num, feature, create_date, expire_date,
         sales_order, delivery_note, purchase_order, license_id
  FROM free_licenses
  ORDER BY lac IS NULL, lac, create_date IS NULL, create_date, feature ASC
`;

// GET /api/freelicenses — toutes les lignes
router.get('/', (req, res) => {
  res.json(db.prepare(SELECT).all());
});

// POST /api/freelicenses/import — remplace TOUTES les données (admin)
router.post('/import', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  try {
    const lower = String(req.file.originalname || '').toLowerCase();
    const parsed = lower.endsWith('.xlsx')
      ? parseLicenseXlsx(req.file.buffer)
      : parseLicenseTsv(req.file.buffer);
    if (!parsed.rows.length) return res.status(400).json({ error: 'Fichier vide ou illisible.' });

    const idx = parsed.rows[0]._idx || {};
    const required = ['lac', 'total quantity', 'feature #', 'feature', 'create date'];
    const missing = required.filter((k) => !(k in idx));
    if (missing.length) {
      return res.status(400).json({ error: `Format non reconnu : colonne(s) absente(s) — ${missing.join(', ')}` });
    }

    const tx = db.transaction(() => {
      const removed = db.prepare('DELETE FROM free_licenses').run().changes;
      const ins = db.prepare(`
        INSERT INTO free_licenses (
          lac, total_quantity, feature_num, feature, create_date, expire_date,
          sales_order, delivery_note, purchase_order, license_id
        ) VALUES (?,?,?,?,?,?,?,?,?,?)
      `);
      let count = 0;
      for (const r of parsed.rows) {
        ins.run(
          txt(col(r, 'LAC')),
          int(col(r, 'Total Quantity')),
          txt(col(r, 'Feature #')),
          txt(col(r, 'Feature')),
          parseDate(col(r, 'Create Date')),
          parseDate(col(r, 'Expire Date')),
          txt(col(r, 'Sales Order #')),
          txt(col(r, 'Delivery Note #')),
          txt(col(r, 'Purchase Order #')),
          cleanId(txt(col(r, 'License ID')))
        );
        count++;
      }
      return { removed, count };
    });
    const { removed, count } = tx();

    logAudit({
      user: req.user,
      action: 'Import Free Licences',
      category: 'license',
      target: `Fichier « ${req.file.originalname} »`,
      detail: `${count} importée(s), ${removed} ancienne(s) supprimée(s)`
    });

    res.json({ ok: true, count, removed });
  } catch (e) {
    res.status(400).json({ error: `Import impossible : ${e.message}` });
  }
});

// DELETE /api/freelicenses/:id — supprime une ligne (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const row = db.prepare('SELECT * FROM free_licenses WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Ligne introuvable' });
  db.prepare('DELETE FROM free_licenses WHERE id = ?').run(id);
  logAudit({
    user: req.user,
    action: 'Suppression d\'une ligne Free Licences',
    category: 'license',
    target: row.lac || 'sans LAC',
    detail: `${row.feature || row.feature_num || ''} · qty ${row.total_quantity}`.trim()
  });
  res.json({ ok: true });
});

module.exports = router;
