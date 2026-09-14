import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { formatDate } from '../utils.js';
import ColumnFilter from '../components/ColumnFilter.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { FileSpreadsheet, Upload, Loader2, Trash2, Search, X, Filter } from 'lucide-react';

const COLUMNS = [
  { key: 'lac', label: 'LAC', type: 'text' },
  { key: 'total_quantity', label: 'Total Quantity', type: 'number', center: true },
  { key: 'feature_num', label: 'Feature #', type: 'text' },
  { key: 'feature', label: 'Feature', type: 'text' },
  { key: 'create_date', label: 'Created Date', type: 'date' },
  { key: 'expire_date', label: 'Expire Date', type: 'date' },
  { key: 'sales_order', label: 'Sales Order #', type: 'text' },
  { key: 'delivery_note', label: 'Delivery Note #', type: 'text' },
  { key: 'purchase_order', label: 'Purchase Order #', type: 'text' },
  { key: 'license_id', label: 'License ID', type: 'text' },
];

const WIDTHS = {
  lac: '8%', total_quantity: '6%', feature_num: '8%', feature: '14%',
  create_date: '8%', expire_date: '8%', sales_order: '10%', delivery_note: '10%',
  purchase_order: '10%', license_id: '10%',
};

const MOIS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

function getCellKey(r, col) {
  const v = r[col.key];
  if (col.type === 'date') {
    if (!v) return '__EMPTY__';
    return v.slice(0, 7);
  }
  if (v === null || v === undefined || v === '') return '__EMPTY__';
  return String(v);
}

function getCellLabel(col, key) {
  if (key === '__EMPTY__') return '(vide)';
  if (col.type === 'date') {
    const [y, m] = key.split('-');
    return `${MOIS[Number(m) - 1]} ${y}`;
  }
  return key;
}

export default function FreeLicences() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const fileRef = useRef(null);

  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState('');
  const [confirmRow, setConfirmRow] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [search, setSearch] = useState('');
  const [colFilters, setColFilters] = useState({});
  const [filterOpen, setFilterOpen] = useState(null);
  const [dateRanges, setDateRanges] = useState({});

  const [sortKey, setSortKey] = useState('lac');
  const [sortDir, setSortDir] = useState('asc');

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
  const dragRef = useRef(false);
  const WIDTHS_KEY = 'freelicenses-colwidths';

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAllRows(await api.get('/freelicenses'));
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

  function applyFilters(rows, colFiltersToApply, skipKey) {
    let arr = rows;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((r) =>
        ['lac', 'feature_num', 'feature', 'sales_order', 'delivery_note', 'purchase_order', 'license_id']
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
    arr = [...arr];
    arr.sort((a, b) => {
      let va, vb;
      if (sortKey === 'total_quantity') {
        va = Number(a[sortKey]) || 0; vb = Number(b[sortKey]) || 0;
      } else if (sortKey === 'create_date' || sortKey === 'expire_date') {
        va = a[sortKey] || ''; vb = b[sortKey] || '';
      } else {
        va = a[sortKey] == null ? '' : String(a[sortKey]);
        vb = b[sortKey] == null ? '' : String(b[sortKey]);
      }
      const vaEmpty = va === '' || va == null;
      const vbEmpty = vb === '' || vb == null;
      if (vaEmpty && vbEmpty) return 0;
      if (vaEmpty) return 1;
      if (vbEmpty) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * (sortDir === 'asc' ? 1 : -1);
      return String(va).localeCompare(String(vb), 'fr', { numeric: true }) * (sortDir === 'asc' ? 1 : -1);
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, search, colFilters, dateRanges, sortKey, sortDir]);

  const openCol = COLUMNS.find((c) => c.key === filterOpen) || null;
  const filterOptions = useMemo(() => {
    if (!openCol) return [];
    const base = applyFilters(allRows, colFilters, filterOpen);
    const map = {};
    for (const r of base) {
      const k = getCellKey(r, openCol);
      map[k] = (map[k] || 0) + 1;
    }
    const toSort = Object.entries(map).map(([k, count]) => ({ key: k, label: getCellLabel(openCol, k), count }));
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
    return Object.values(colFilters).some((v) => Array.isArray(v) && v.length > 0)
      || Object.values(dateRanges).some((r) => r && (r.from || r.to));
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 6000);
  }

  function clearFilters() {
    setSearch('');
    setColFilters({});
    setDateRanges({});
    setFilterOpen(null);
  }

  async function doImport(file) {
    if (!isAdmin) {
      showToast('Seul un administrateur peut importer les Free Licences.');
      return;
    }
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const r = await api.upload('/freelicenses/import', file);
      const count = r.count ?? 0;
      const removed = r.removed ?? 0;
      showToast(
        removed
          ? `Import : ${count} ligne(s) importée(s) · ${removed} ancienne(s) remplacée(s)`
          : `Import : ${count} ligne(s) importée(s)`
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (!files || !files.length) return;
    await doImport(files[0]);
  }

  function onFileChosen(e) {
    const f = e.target.files && e.target.files[0];
    if (f) doImport(f);
    e.target.value = '';
  }

  async function handleDeleteRow() {
    if (!confirmRow) return;
    setDeleting(true);
    setError('');
    try {
      await api.del(`/freelicenses/${confirmRow.id}`);
      showToast('Ligne supprimée');
      setConfirmRow(null);
      load();
    } catch (e) {
      setError(e.message);
      setConfirmRow(null);
    } finally {
      setDeleting(false);
    }
  }

  const sumUsers = filtered.reduce((a, r) => a + (Number(r.total_quantity) || 0), 0);

  return (
    <div className="freelicenses-page">
      <div className="page-header">
        <div>
          <h2>Free Licences</h2>
          <div className="sub">{filtered.length} enregistrement{filtered.length > 1 ? 's' : ''} sur {allRows.length}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx" style={{ display: 'none' }} onChange={onFileChosen} />
          {isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
              Importer
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {toast && <div className="toast">{toast}</div>}

      <div className="toolbar">
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#64748b' }} />
          <input
            type="text"
            placeholder="Rechercher (LAC, feature, commande, licence)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30 }}
          />
        </div>
        <button className="btn btn-xs btn-ghost" onClick={clearFilters}><X size={12} /> Réinitialiser</button>
      </div>

      <div
        className={`table-wrap${dragOver ? ' drag-over' : ''}`}
        ref={wrapRef}
        onDragOver={(e) => {
          if (!isAdmin) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget) && dragOver) setDragOver(false);
        }}
        onDrop={handleDrop}
      >
        {loading ? (
          <div className="empty-state"><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <FileSpreadsheet size={28} />
            <p>Aucune donnée importée. <br />Glissez-déposez un fichier (CSV/TSV) de licences sur cette table, ou cliquez sur « Importer ».</p>
          </div>
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
                      <span className="th-meta">
                        <span className="th-sort">{sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                        <button
                          className={`filter-funnel ${colActive ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); toggleFilterColumn(c.key); }}
                          title="Filtrer"
                        >
                          <Filter size={11} />
                        </button>
                      </span>
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
                {isAdmin && <th style={{ width: 50, textAlign: 'center' }} title="Supprimer la ligne">Act.</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td title={r.lac || '—'}>{r.lac || '—'}</td>
                  <td style={{ textAlign: 'center' }} title={r.total_quantity ?? '—'}>{(Number(r.total_quantity) || 0).toLocaleString('fr-FR')}</td>
                  <td title={r.feature_num || '—'}>{r.feature_num || '—'}</td>
                  <td title={r.feature || '—'}>{r.feature || '—'}</td>
                  <td title={formatDate(r.create_date)}>{formatDate(r.create_date)}</td>
                  <td title={formatDate(r.expire_date)}>{formatDate(r.expire_date)}</td>
                  <td title={r.sales_order || '—'}>{r.sales_order || '—'}</td>
                  <td title={r.delivery_note || '—'}>{r.delivery_note || '—'}</td>
                  <td title={r.purchase_order || '—'}>{r.purchase_order || '—'}</td>
                  <td title={r.license_id || '—'}>{r.license_id || '—'}</td>
                  {isAdmin && (
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn btn-xs btn-danger" onClick={() => setConfirmRow(r)} title="Supprimer cette ligne">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="report-sum-row">
                <td colSpan={1}>Total ({filtered.length} position{filtered.length > 1 ? 's' : ''})</td>
                <td colSpan={1} style={{ textAlign: 'center', fontWeight: 700 }}>
                  {sumUsers.toLocaleString('fr-FR')}
                </td>
                <td colSpan={8 + (isAdmin ? 1 : 0)}></td>
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

      {confirmRow && (
        <ConfirmDialog
          title="Supprimer cette ligne ?"
          message={`LAC ${confirmRow.lac || '—'} — ${confirmRow.feature || confirmRow.feature_num || ''} (qty ${confirmRow.total_quantity})`.trim()}
          onCancel={() => !deleting && setConfirmRow(null)}
          onConfirm={handleDeleteRow}
          loading={deleting}
        />
      )}
    </div>
  );
}
