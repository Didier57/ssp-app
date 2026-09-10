const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const SRC = 'c:/temp/Table SSPOSBIZ.xlsx';
const OUT = path.join(__dirname, '..', 'scripts', 'data.json');

function excelDateToISO(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  return s;
}

function toStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function toInt(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : Math.round(n);
}

function toBool(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return /^1|true|oui$/i.test(s) ? 1 : 0;
}

const wb = XLSX.readFile(SRC, { cellDates: true });
const ws = wb.Sheets['A'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

const customers = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i] || [];
  if (!r[0] && !r[1]) continue; // ligne vide
  customers.push({
    customer: toStr(r[0]),
    customer_site: toStr(r[1]),
    date_end_licence: excelDateToISO(r[2]),
    product: toStr(r[3]),
    mac_address: toStr(r[4]),
    lic_35: toInt(r[5]),
    siel_id: toStr(r[6]),
    registered_company: toStr(r[7]),
    number_user: toInt(r[8]),
    contract: toBool(r[9]),
    last_lac: toStr(r[10]),
    date_last_lac: excelDateToISO(r[11]),
    udl_contract: toStr(r[12]),
    dlu_contract: toStr(r[13]),
    info_divers: toStr(r[14])
  });
}

const data = {
  customers,
  meta: {
    source_file: SRC,
    customer_count: customers.length
  }
};

fs.writeFileSync(OUT, JSON.stringify(data, null, 2), 'utf-8');
console.log(`OK: ${customers.length} clients importés depuis ${SRC}`);
console.log(`Fichier écrit: ${OUT}`);

// Afficher 3 exemples pour vérification
for (const c of customers.slice(0, 3)) {
  console.log(JSON.stringify(c));
}
