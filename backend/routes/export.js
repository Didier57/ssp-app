const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const COLS = [
  'id','customer','customer_site','date_end_licence','product','mac_address','lic_35',
  'siel_id','registered_company','number_user','contract','last_lac','date_last_lac',
  'udl_contract','dlu_contract','info_divers'
];

const LABELS = {
  id:'ID', customer:'Customer', customer_site:'Customer site', date_end_licence:'Date fin licence',
  product:'Product', mac_address:'Mac address', lic_35:'LIC 3/5', siel_id:'SIEL ID',
  registered_company:'Registered Company', number_user:'Nb User', contract:'Contract',
  last_lac:'Last LAC', date_last_lac:'Date Last LAC', udl_contract:'UDL Contract',
  dlu_contract:'DLU Contract', info_divers:'Information'
};

function toCSV(rows) {
  const header = COLS.map(c => `"${LABELS[c].replace(/"/g, '""')}"`).join(';');
  const lines = rows.map(r =>
    COLS.map(c => {
      const v = r[c] == null ? '' : String(r[c]);
      return `"${v.replace(/"/g, '""')}"`;
    }).join(';')
  );
  return '\uFEFF' + [header, ...lines].join('\r\n');
}

// GET /api/export/csv
router.get('/csv', (req, res) => {
  const rows = db.prepare('SELECT * FROM customers ORDER BY customer COLLATE NOCASE ASC').all();
  const csv = toCSV(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
  res.send(csv);
});

module.exports = router;
