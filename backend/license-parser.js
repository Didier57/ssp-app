const MONTHS = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

function splitRow(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === '\t') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseDate(s) {
  const m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})$/.exec(String(s || '').trim());
  if (!m || !MONTHS[m[1]]) return null;
  return `${m[3]}-${String(MONTHS[m[1]]).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

function parseLicenseTsv(buf) {
  const enc = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe ? 'utf16le' : 'utf8';
  const raw = buf.toString(enc).replace(/^\uFEFF/, '');
  const lines = raw.split(/\r\n|\n/);
  const header = splitRow(lines[0]).map((h) => h.trim());
  const indexOf = {};
  header.forEach((h, i) => {
    const k = h.toLowerCase();
    if (!(k in indexOf)) indexOf[k] = i;
  });
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i];
    if (!t || !t.trim()) continue;
    rows.push({ _raw: splitRow(t), _idx: indexOf });
  }
  return { header, rows };
}

function col(row, name) {
  const i = row._idx[String(name).toLowerCase()];
  if (i === undefined) return '';
  const v = row._raw[i];
  return typeof v === 'string' ? v.trim() : v;
}

function normalizeRows(header, rawRows) {
  const indexOf = {};
  header.forEach((h, i) => {
    const k = h.toLowerCase();
    if (!(k in indexOf)) indexOf[k] = i;
  });
  const rows = [];
  for (const row of rawRows) {
    if (!row || !row.some((c) => String(c).trim() !== '')) continue;
    rows.push({ _raw: row, _idx: indexOf });
  }
  return { header, rows, indexOf };
}

function parseLicenseXlsx(buf) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
  let ws = null;
  for (const name of wb.SheetNames) {
    if (wb.Sheets[name] && wb.Sheets[name]['!ref']) { ws = wb.Sheets[name]; break; }
  }
  if (!ws) throw new Error('Aucune feuille de données dans le fichier.');
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  let hi = -1;
  for (let i = 0; i < aoa.length; i++) {
    if (aoa[i].some((c) => String(c).trim() !== '')) { hi = i; break; }
  }
  if (hi < 0) throw new Error('Fichier vide.');
  const header = aoa[hi].map((x) => String(x).trim());
  const parsed = normalizeRows(header, aoa.slice(hi + 1));
  return parsed;
}

module.exports = { parseLicenseTsv, parseLicenseXlsx, col, parseDate };