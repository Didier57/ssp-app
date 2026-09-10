import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { formatDate, daysUntil } from '../utils.js';
import CustomerForm from '../components/CustomerForm.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ColumnFilter from '../components/ColumnFilter.jsx';
import LicenseFilesModal from '../components/LicenseFilesModal.jsx';
import { Plus, FileSpreadsheet, Search, X, Filter, FileArchive, Pencil, Trash2, CalendarRange } from 'lucide-react';

function normalizeMac(s) {
  const c = String(s || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  return c.length === 12 ? c.replace(/(.{2})(?=.)/g, '$1-') : '';
}

// Extrait une MAC d'un nom de fichier (: = _ ou 12 hex sans séparateur)
function extractMac(text) {
  const t = String(text || '').toUpperCase();
  const sep = t.match(/([0-9A-F]{2}([:_\-])[0-9A-F]{2}\2[0-9A-F]{2}\2[0-9A-F]{2}\2[0-9A-F]{2}\2[0-9A-F]{2})/);
  if (sep) return sep[1];
  const pl = t.match(/(?<![0-9A-F])[0-9A-F]{12}(?![0-9A-F])/);
  return pl ? pl[0] : null;
}

const COLUMNS = [
  { key: 'customer', label: 'Customer', type: 'text' },
  { key: 'customer_site', label: 'Customer site', type: 'text' },
  { key: 'product', label: 'Product', type: 'text' },
  { key: 'date_end_licence', label: 'Fin licence', type: 'date' },
  { key: 'lic_35', label: 'LIC 3/5', type: 'number', center: true },
  { key: 'mac_address', label: 'MAC', type: 'text' },
  { key: 'siel_id', label: 'SIEL ID', type: 'text' },
  { key: 'registered_company', label: 'Société', type: 'text' },
  { key: 'number_user', label: 'Nb users', type: 'number', center: true },
  { key: 'contract', label: 'Contrat', type: 'bool' },
  { key: 'last_lac', label: 'Last LAC', type: 'text' },
  { key: 'date_last_lac', label: 'Date last LAC', type: 'date' },
  { key: 'udl_contract', label: 'UDL', type: 'text' },
  { key: 'dlu_contract', label: 'DLU', type: 'text' },
  { key: 'info_divers', label: 'Information', type: 'text' }
];

// largeurs relatives (%) pour que tout tienne à l'écran
const WIDTHS = {
  customer: '12%', customer_site: '8%', product: '8%', date_end_licence: '4.5%',
  lic_35: '2.5%', mac_address: '6%', siel_id: '6.5%', registered_company: '9%',
  number_user: '3.5%', contract: '5%', last_lac: '11%', date_last_lac: '4.5%',
  udl_contract: '3.5%', dlu_contract: '3.5%', info_divers: '6.5%'
};

const MOIS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

// clé de filtrage d'une cellule (type Excel)
function getCellKey(r, col) {
  const v = r[col.key];
  if (col.type === 'bool') return v ? '1' : '0';
  if (col.type === 'date') {
    if (!v) return '__EMPTY__';
    return v.slice(0, 7); // YYYY-MM
  }
  if (v === null || v === undefined || v === '') return '__EMPTY__';
  return String(v);
}

function getCellLabel(col, key) {
  if (key === '__EMPTY__') return '(vide)';
  if (col.type === 'bool') return key === '1' ? 'Oui' : 'Non';
  if (col.type === 'date') {
    const [y, m] = key.split('-');
    return `${MOIS[Number(m) - 1]} ${y}`;
  }
  return key;
}

export default function Clients() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [colFilters, setColFilters] = useState({ contract: ['1'] }); // Par défaut : clients avec contrat
  const [filterOpen, setFilterOpen] = useState(null); // clé de colonne ouverte ou null
  const [dateRanges, setDateRanges] = useState({}); // { [colKey]: { from, to } } pour les colonnes de date

  const [sortKey, setSortKey] = useState('date_end_licence');
  const [sortDir, setSortDir] = useState('asc'); // dates les plus proches en haut

  // ==== Redimensionnement des colonnes ====
  function pctToPx(total) {
    const out = {};
    for (const c of COLUMNS) {
      let p = WIDTHS[c.key];
      if (typeof p === 'string' && p.endsWith('%')) p = parseFloat(p);
      out[c.key] = Math.max(40, Math.round((total * (p || 8)) / 100));
    }
    return out;
  }
  const wrapRef = useRef(null);
  const dragRef = useRef(false); // true si un redimensionnement a réellement bougé
  const WIDTHS_KEY = 'clients-colwidths';

  function loadWidths(total) {
    const base = pctToPx(total);
    if (typeof localStorage === 'undefined') return base;
    try {
      const saved = JSON.parse(localStorage.getItem(WIDTHS_KEY) || '{}');
      for (const k of Object.keys(saved)) if (k in base) base[k] = saved[k];
    } catch { /* ignore */ }
    return base;
  }

  function persistWidths(widths) {
    try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths)); } catch { /* ignore */ }
  }

  const [colWidths, setColWidths] = useState(() => loadWidths(1400));

  useEffect(() => {
    if (wrapRef.current) setColWidths(loadWidths(wrapRef.current.clientWidth));
  }, []);

  function startResize(e, key) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = false;
    const startX = e.clientX;
    const startW = colWidths[key] || 120;
    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      if (Math.abs(delta) > 3) dragRef.current = true;
      setColWidths((prev) => {
        const next = { ...prev, [key]: Math.max(40, startW + delta) };
        persistWidths(next);
        return next;
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setTimeout(() => { dragRef.current = false; }, 0);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function resetColWidth(key) {
    const total = wrapRef.current ? wrapRef.current.clientWidth : 1400;
    setColWidths((prev) => {
      const next = { ...prev, [key]: pctToPx(total)[key] };
      persistWidths(next);
      return next;
    });
  }

  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState('');
  const [tableDragOver, setTableDragOver] = useState(false); // fichier licence survolant la table
  const [filesModal, setFilesModal] = useState(null); // client dont on affiche les fichiers

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/customers');
      setAllRows(data);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Applique recherche + filtres colonne (sauf columnSkip)
  function applyFilters(rows, colFiltersToApply, skipKey) {
    let arr = rows;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((r) =>
        ['customer', 'customer_site', 'mac_address', 'siel_id', 'last_lac']
          .some((k) => String(r[k] || '').toLowerCase().includes(q))
      );
    }

    for (const [key, values] of Object.entries(colFiltersToApply)) {
      if (key === skipKey) continue;
      if (!values || values.length === 0) continue;
      const col = COLUMNS.find((c) => c.key === key);
      arr = arr.filter((r) => values.includes(getCellKey(r, col)));
    }

    for (const [key, rng] of Object.entries(dateRanges)) {
      if (key === skipKey) continue;
      if (!rng || (!rng.from && !rng.to)) continue;
      arr = arr.filter((r) => {
        const v = String(r[key] || '');
        if (!v) return false;
        if (rng.from && v < rng.from) return false;
        if (rng.to && v > rng.to) return false;
        return true;
      });
    }
    return arr;
  }

  const filtered = useMemo(() => {
    let arr = applyFilters(allRows, colFilters, null);
    // Tri
    arr = [...arr];
    arr.sort((a, b) => {
      let va, vb;
      if (sortKey === 'contract') {
        va = a.contract ? 1 : 0; vb = b.contract ? 1 : 0;
      } else if (sortKey === 'date_end_licence' || sortKey === 'date_last_lac') {
        va = a[sortKey] || ''; vb = b[sortKey] || '';
      } else if (sortKey === 'number_user' || sortKey === 'lic_35') {
        va = Number(a[sortKey]) || 0; vb = Number(b[sortKey]) || 0;
      } else {
        va = a[sortKey] == null ? '' : String(a[sortKey]);
        vb = b[sortKey] == null ? '' : String(b[sortKey]);
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * (sortDir === 'asc' ? 1 : -1);
      }
      return String(va).localeCompare(String(vb), 'fr', { numeric: true }) * (sortDir === 'asc' ? 1 : -1);
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, search, colFilters, dateRanges, sortKey, sortDir]);

  // Options de filtre de la colonne ouverte (dynamique comme Excel : dépend des autres filtres)
  const openCol = COLUMNS.find((c) => c.key === filterOpen) || null;
  const filterOptions = useMemo(() => {
    if (!openCol) return [];
    const base = applyFilters(allRows, colFilters, filterOpen);
    const map = {};
    for (const r of base) {
      const k = getCellKey(r, openCol);
      map[k] = (map[k] || 0) + 1;
    }
    const toSort = Object.entries(map).map(([k, count]) => ({
      key: k,
      label: getCellLabel(openCol, k),
      count
    }));
    const empty = toSort.find((o) => o.key === '__EMPTY__');
    const others = toSort.filter((o) => o.key !== '__EMPTY__')
      .sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true }));
    return empty ? [...others, empty] : others;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, filterOpen, colFilters, dateRanges, search]);

  function onSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function toggleFilterColumn(key) {
    setFilterOpen((cur) => (cur === key ? null : key));
  }

  function toggleColValue(key, value) {
    setColFilters((f) => {
      const cur = f[key] || [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      const o = { ...f, [key]: next };
      if (next.length === 0) delete o[key];
      return o;
    });
  }

  function clearColFilter(key) {
    setColFilters((f) => {
      const o = { ...f };
      delete o[key];
      return o;
    });
  }

  function setDateRange(key, side, value) {
    setDateRanges((d) => {
      const cur = d[key] || { from: '', to: '' };
      const next = { ...cur, [side]: value };
      const o = { ...d, [key]: next };
      if (!next.from && !next.to) delete o[key];
      return o;
    });
  }

  function clearDateRange(key) {
    setDateRanges((d) => {
      const o = { ...d };
      delete o[key];
      return o;
    });
  }

function hasActiveColFilter() {
  return Object.entries(colFilters).some(
    ([k, v]) => k !== 'contract' && Array.isArray(v) && v.length > 0
  ) || Object.values(dateRanges).some((r) => r && (r.from || r.to));
}

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  // Drag & drop de un ou plusieurs fichiers licence n'importe où sur la table :
  // la MAC extraite de chaque nom de fichier désigne le client cible.
  async function handleFileDrop(e) {
    e.preventDefault();
    setTableDragOver(false);
    if (!isAdmin) { showToast('Seul un administrateur peut ajouter un fichier licence.'); return; }
    let files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (!files.length && e.dataTransfer && e.dataTransfer.items) {
      files = Array.from(e.dataTransfer.items)
        .filter((i) => i.kind === 'file')
        .map((i) => i.getAsFile());
    }
    if (!files.length) return;

    let added = 0;
    const errors = [];
    for (const file of files) {
      const fileMac = normalizeMac(extractMac(file.name));
      if (!fileMac) {
        errors.push(`« ${file.name} » : pas de MAC dans le nom`);
        continue;
      }
      const customer = allRows.find((r) => r.mac_address && normalizeMac(r.mac_address) === fileMac);
      if (!customer) {
        errors.push(`« ${file.name} » : aucun client avec la MAC ${fileMac}`);
        continue;
      }
      try {
        await api.upload(`/customers/${customer.id}/files`, file);
        added++;
      } catch (err) {
        errors.push(`« ${file.name} » : ${err.message}`);
      }
    }
    if (added) load();
    if (errors.length) {
      showToast(`Ajouté(s): ${added} · Rejeté(s): ${errors.length} — ${errors[0]}`);
    } else if (added) {
      showToast(`${added} fichier(s) licence ajouté(s)`);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.del(`/customers/${confirmDelete.id}`);
      setConfirmDelete(null);
      showToast('Supprimé');
      load();
    } catch (e) {
      showToast(e.message);
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function toggleContract(r, value) {
    const prev = allRows;
    const nextVal = Number(value);
    setAllRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, contract: nextVal } : x)));
    try {
      await api.put(`/customers/${r.id}`, { contract: nextVal });
      showToast(`Contrat ${nextVal ? 'activé' : 'désactivé'} pour ${r.customer}`);
    } catch (e) {
      setAllRows(prev);
      showToast(e.message);
    }
  }

  async function exportExcel() {
    const XLSX = await import('exceljs');
    const saveAs = (await import('file-saver')).saveAs;
    const wb = new XLSX.Workbook();
    const ws = wb.addWorksheet('Clients');
    ws.columns = COLUMNS.map((c) => ({ header: c.label, key: c.key, width: 18 }));
    ws.addRows(filtered.map((r) => {
      const o = {};
      for (const c of COLUMNS) o[c.key] = r[c.key] ?? '';
      return o;
    }));
    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'clients_ssp.xlsx');
    showToast('Export Excel généré');
  }

  function clearFilters() {
    setSearch('');
    setColFilters({ contract: ['1'] }); // retour à la vue par défaut
    setDateRanges({});
    setSortKey('date_end_licence');
    setSortDir('asc');
    setFilterOpen(null);
  }

  return (
    <div className="clients-page">
      <div className="page-header">
        <div>
          <h2>Clients</h2>
          <div className="sub">{filtered.length} enregistrement{filtered.length > 1 ? 's' : ''} sur {allRows.length}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={exportExcel}><FileSpreadsheet size={15} /> Excel</button>
          {isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>
              <Plus size={15} /> Ajouter
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#64748b' }} />
          <input
            type="text"
            placeholder="Rechercher (nom, site, MAC, SIEL, LAC)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30 }}
          />
        </div>
        <div className="toolbar-date">
          <span className="toolbar-date-label" title="Filtrer sur la colonne Date last LAC">
            <CalendarRange size={13} /> Date dern. LAC
          </span>
          <input
            type="date"
            value={dateRanges.date_last_lac?.from || ''}
            onChange={(e) => setDateRange('date_last_lac', 'from', e.target.value)}
            title="Date de début"
          />
          <span className="toolbar-date-sep">→</span>
          <input
            type="date"
            value={dateRanges.date_last_lac?.to || ''}
            onChange={(e) => setDateRange('date_last_lac', 'to', e.target.value)}
            title="Date de fin"
          />
          {(dateRanges.date_last_lac?.from || dateRanges.date_last_lac?.to) && (
            <button className="btn btn-xs btn-ghost" onClick={() => clearDateRange('date_last_lac')} title="Effacer le filtre date"><X size={12} /></button>
          )}
        </div>
        <button className="btn btn-xs btn-ghost" onClick={clearFilters}><X size={12} /> Réinitialiser</button>
      </div>

      <div
        className={`table-wrap${tableDragOver ? ' drag-over' : ''}`}
        ref={wrapRef}
        onDragOver={(e) => {
          if (!isAdmin) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!tableDragOver) setTableDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget) && tableDragOver) setTableDragOver(false);
        }}
        onDrop={handleFileDrop}
      >
        {loading ? (
          <div className="empty-state"><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">Aucun client trouvé</div>
        ) : (
          <table className="table table-compact clients-bordered">
            <thead>
              <tr>
                {COLUMNS.map((c) => {
                  const colActive =
                    (Array.isArray(colFilters[c.key]) && colFilters[c.key].length > 0) ||
                    !!(dateRanges[c.key] && (dateRanges[c.key].from || dateRanges[c.key].to));
                  return (
                    <th key={c.key} style={{ width: colWidths[c.key], textAlign: c.center ? 'center' : 'left' }} onClick={() => { if (!dragRef.current) onSort(c.key); }}>
                      <span className="th-label">{c.label}</span>
                      <span className="th-sort">{sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                      <button
                        className={`filter-funnel ${colActive ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleFilterColumn(c.key); }}
                        title="Filtrer"
                      >
                        <Filter size={11} />
                      </button>
                      <span
                        className="col-resize-handle"
                        onMouseDown={(e) => startResize(e, c.key)}
                        onDoubleClick={(e) => { e.stopPropagation(); resetColWidth(c.key); }}
                        title="Glisser pour redimensionner · Double-clic : largeur par défaut"
                      />
                      {filterOpen === c.key && openCol && (
                        c.type === 'date' ? (
                          <ColumnFilter
                            type="date"
                            label={c.label}
                            range={dateRanges[c.key]}
                            onRangeChange={(side, v) => setDateRange(c.key, side, v)}
                            onClear={() => clearDateRange(c.key)}
                            onClose={() => setFilterOpen(null)}
                            options={[]}
                            selected={[]}
                            onToggle={() => {}}
                          />
                        ) : (
                          <ColumnFilter
                            label={c.label}
                            options={filterOptions}
                            selected={colFilters[c.key] || []}
                            onToggle={(v) => toggleColValue(c.key, v)}
                            onClear={() => clearColFilter(c.key)}
                            onClose={() => setFilterOpen(null)}
                          />
                        )
                      )}
                    </th>
                  );
                })}
                <th style={{ width: 40, textAlign: 'center' }} title="Fichiers licence">Fic.</th>
                {isAdmin && <th style={{ width: 70 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const d = daysUntil(r.date_end_licence);
                const cellDateClass = d != null && d < 0 ? 'cell-red' : d != null && d <= 90 ? 'cell-orange' : '';
                return (
                  <tr key={r.id}>
                    <td title={r.customer || '—'}><b>{r.customer}</b></td>
                    <td title={r.customer_site || '—'}>{r.customer_site || '—'}</td>
                    <td title={r.product || '—'}>{r.product || '—'}</td>
                    <td className={cellDateClass} title={formatDate(r.date_end_licence)}>{formatDate(r.date_end_licence)}</td>
                    <td style={{ textAlign: 'center' }} title={r.lic_35 ?? '—'}>{r.lic_35 ?? '—'}</td>
                    <td title={r.mac_address || '—'}>{r.mac_address || '—'}</td>
                    <td title={r.siel_id || '—'}>{r.siel_id || '—'}</td>
                    <td title={r.registered_company || '—'}>{r.registered_company || '—'}</td>
                    <td style={{ textAlign: 'center' }} title={r.number_user ?? '—'}>{r.number_user ?? '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {isAdmin ? (
                        <input
                          type="checkbox"
                          className="table-checkbox"
                          checked={!!r.contract}
                          onChange={(e) => toggleContract(r, e.target.checked ? 1 : 0)}
                          title="Contrat"
                        />
                      ) : (
                        r.contract ? <span className="badge badge-green">O</span> : <span className="badge badge-gray">N</span>
                      )}
                    </td>
                    <td title={r.last_lac || '—'}>{r.last_lac || '—'}</td>
                    <td title={formatDate(r.date_last_lac)}>{formatDate(r.date_last_lac)}</td>
                    <td title={r.udl_contract || '—'}>{r.udl_contract || '—'}</td>
                    <td title={r.dlu_contract || '—'}>{r.dlu_contract || '—'}</td>
                    <td className="cell-info" title={r.info_divers || '—'}>{r.info_divers || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-xs btn-ghost btn-files"
                        title={r.file_count ? `${r.file_count} fichier(s) licence` : 'Aucun fichier licence — glissez un fichier ici'}
                        onClick={(e) => { e.stopPropagation(); setFilesModal(r); }}
                      >
                        <FileArchive size={12} />{r.file_count ? ` ${r.file_count}` : ''}
                      </button>
                    </td>
                    {isAdmin && (
                      <td className="row-actions">
                        <button className="btn btn-xs btn-ghost" onClick={() => setEditing(r)} title="Modifier"><Pencil size={13} /></button>
                        <button className="btn btn-xs btn-danger" onClick={() => setConfirmDelete(r)} title="Supprimer"><Trash2 size={13} /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="report-sum-row">
                <td colSpan={8}>Total ({filtered.length} client{filtered.length > 1 ? 's' : ''})</td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>
                  {filtered.reduce((s, r) => s + (Number(r.number_user) || 0), 0).toLocaleString('fr-FR')}
                </td>
                <td colSpan={7 + (isAdmin ? 1 : 0)}></td>
              </tr>
            </tfoot>
          </table>
        )}
        <div className="table-footer">
          <span>{filtered.length} ligne{filtered.length > 1 ? 's' : ''}</span>
          {hasActiveColFilter() && <span className="badge badge-blue">Filtres colonnes actifs</span>}
          {!isAdmin && <span>Mode lecture seule</span>}
        </div>
      </div>

      {editing && isAdmin && (
        <CustomerForm
          customer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            showToast('Enregistré');
            load();
          }}
        />
      )}
      {confirmDelete && isAdmin && (
        <ConfirmDialog
          title="Supprimer ce client ?"
          message={`« ${confirmDelete.customer} » (${confirmDelete.product || 'produit inconnu'}) sera définitivement supprimé. Cette action est irréversible.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}
      {toast && <div className="toast">{toast}</div>}

      {filesModal && (
        <LicenseFilesModal
          customer={filesModal}
          isAdmin={isAdmin}
          onClose={() => setFilesModal(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}