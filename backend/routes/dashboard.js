const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

function parseProduct(base) {
  // "Openscape Business X5 V2" -> { size: "X5", version: "V2" }
  const m = String(base || '').match(/Open?scape Business ([X][0-9R]?|[S])(?: ([V][0-9]+|S))?/i);
  if (!m) return { size: null, version: null };
  return { size: m[1], version: m[2] || null };
}

router.get('/', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
  const activeContracts = db.prepare('SELECT COUNT(*) AS c FROM customers WHERE contract = 1').get().c;

  const now = new Date().toISOString().slice(0, 10);
  const expiring90 = db.prepare(
    `SELECT COUNT(*) AS c FROM customers
     WHERE date_end_licence IS NOT NULL AND date_end_licence != ''
       AND date(date_end_licence) BETWEEN date(?) AND date(?, '+90 days')`
  ).get(now, now).c;

  const expired = db.prepare(
    `SELECT COUNT(*) AS c FROM customers
     WHERE date_end_licence IS NOT NULL AND date_end_licence != ''
       AND date(date_end_licence) < date(?)`
  ).get(now).c;

  // Ventilation par taille de produit (avec ou sans contrat)
  const products = db.prepare(
    `SELECT product, COALESCE(contract, 0) AS contract_flag, COUNT(*) AS n
     FROM customers
     GROUP BY product, contract_flag ORDER BY n DESC`
  ).all();
  const bySize = {};
  const bySizeContract = {};
  const bySizeNoContract = {};
  const byVersion = {};
  for (const p of products) {
    const { size, version } = parseProduct(p.product);
    if (size) {
      bySize[size] = (bySize[size] || 0) + p.n;
      if (p.contract_flag === 1) bySizeContract[size] = (bySizeContract[size] || 0) + p.n;
      else bySizeNoContract[size] = (bySizeNoContract[size] || 0) + p.n;
    }
    if (version) byVersion[version] = (byVersion[version] || 0) + p.n;
  }

  const toSeries = (obj) =>
    Object.entries(obj).map(([k, v]) => ({ key: k, value: v })).sort((a, b) => b.value - a.value);

  // Expirations dans les prochains 6 mois, groupées par mois
  const expirations = db.prepare(
    `SELECT strftime('%Y-%m', date_end_licence) AS mois, COUNT(*) AS n
     FROM customers
     WHERE date_end_licence IS NOT NULL AND date_end_licence != ''
       AND date(date_end_licence) BETWEEN date(?) AND date(?, '+6 months')
     GROUP BY mois ORDER BY mois`
  ).all(now, now);

  res.json({
    total,
    activeContracts,
    expired,
    expiring90,
    bySize: toSeries(bySize),
    bySizeContract: toSeries(bySizeContract),
    bySizeNoContract: toSeries(bySizeNoContract),
    byVersion: toSeries(byVersion),
    expirations
  });
});

router.get('/expiring', (req, res) => {
  const now = new Date().toISOString().slice(0, 10);
  const target = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = db.prepare(
    `SELECT * FROM customers
     WHERE date_end_licence IS NOT NULL AND date_end_licence != ''
       AND date(date_end_licence) BETWEEN date(?) AND date(?)
     ORDER BY date_end_licence ASC`
  ).all(now, target);
  res.json(rows);
});

module.exports = router;
