const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const YEAR_RE = /^\d{4}$/;

// TCD : clients sous contrat, regroupe par Annee / Mois / Jour de date_end_licence
// et somme le nombre d'utilisateurs a activer. Filtre optionnel par annee.
router.get('/', (req, res) => {
  const year = req.query.year && YEAR_RE.test(String(req.query.year)) ? String(req.query.year) : null;

  const years = db
    .prepare(
      `SELECT DISTINCT substr(date_end_licence, 1, 4) AS y
       FROM customers
       WHERE contract = 1
         AND date_end_licence IS NOT NULL AND date_end_licence != ''
         AND substr(date_end_licence, 1, 4) GLOB '[0-9][0-9][0-9][0-9]'
       ORDER BY y DESC`
    )
    .all()
    .map((r) => r.y);

  const rows = db
    .prepare(
      `SELECT substr(date_end_licence, 1, 4) AS annee,
              CAST(substr(date_end_licence, 6, 2) AS INTEGER) AS mois,
              CAST(substr(date_end_licence, 9, 2) AS INTEGER) AS jour,
              SUM(number_user) AS users,
              COUNT(*) AS clients
       FROM customers
       WHERE contract = 1
         AND date_end_licence IS NOT NULL AND date_end_licence != ''
         ${year ? 'AND substr(date_end_licence, 1, 4) = ?' : ''}
       GROUP BY annee, mois, jour
       ORDER BY annee, mois, jour`
    )
    .all(...(year ? [year] : []));

  res.json({ years, rows });
});

module.exports = router;