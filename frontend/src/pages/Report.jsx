import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { formatDate } from '../utils.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { FileSpreadsheet, Upload, Loader2, Trash2 } from 'lucide-react';

const COLUMNS = [
  { key: 'customer', label: 'Customer', center: false },
  { key: 'customer_site', label: 'Customer Site', center: false },
  { key: 'siel_display', label: 'SIEL_ID', center: false },
  { key: 'registered_company', label: 'Registered Company', center: false },
  { key: 'total_quantity', label: 'Nb User', center: true },
  { key: 'create_date', label: 'Date Activation', center: false },
  { key: 'lac', label: 'LAC', center: false },
  { key: 'udl_contract', label: 'UDL Contract', center: false },
  { key: 'dlu_contract', label: 'DLU Contract', center: false },
  { key: 'sales_order', label: 'Sales Order', center: false },
  { key: 'delivery_note', label: 'Delivery Note', center: false },
  { key: 'purchase_order', label: 'Purchase Order', center: false },
  { key: 'license_id', label: 'License ID', center: false },
];

const WIDTHS = {
  customer: '13%', customer_site: '9%', siel_display: '9%', registered_company: '11%',
  total_quantity: '4%', create_date: '6.5%', lac: '12%', udl_contract: '4.5%',
  dlu_contract: '4.5%', sales_order: '6%', delivery_note: '6%', purchase_order: '6%',
  license_id: '6.5%',
};

export default function Report() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const fileRef = useRef(null);
  const [lacs, setLacs] = useState([]);
  const [selected, setSelected] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [lastImport, setLastImport] = useState(null);
  const [confirmRow, setConfirmRow] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [sortKey, setSortKey] = useState('create_date');
  const [sortDir, setSortDir] = useState('desc'); // dates les plus proches en haut

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
  const WIDTHS_KEY = 'report-colwidths';

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

  // ==== Tri ====
  function onSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'create_date' ? 'desc' : 'asc');
    }
  }

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let va, vb;
      if (sortKey === 'total_quantity' || sortKey === 'available_quantity') {
        va = Number(a[sortKey]) || 0; vb = Number(b[sortKey]) || 0;
      } else if (sortKey === 'create_date') {
        va = a[sortKey] || ''; vb = b[sortKey] || '';
      } else {
        va = a[sortKey] == null ? '' : String(a[sortKey]);
        vb = b[sortKey] == null ? '' : String(b[sortKey]);
      }
      const vaEmpty = va === '' || va == null;
      const vbEmpty = vb === '' || vb == null;
      if (vaEmpty && vbEmpty) return 0;
      if (vaEmpty) return 1; // valeurs vides en bas
      if (vbEmpty) return -1;
      const dir = sortDir === 'asc' ? 1 : -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'fr', { numeric: true }) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDir]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 6000);
  }

  async function loadLacs(prefer) {
    setLoading(true);
    try {
      const data = await api.get('/report/lacs');
      const lacList = data || [];
      setLacs(lacList);
      const keep = prefer || selected;
      if (keep && lacList.some((l) => l.lac === keep)) setSelected(keep);
      else if (lacList.length) setSelected(lacList[lacList.length - 1].lac); // dernier LAC
      else setSelected('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRows(lac) {
    setLoadingRows(true);
    try {
      setRows(await api.get(`/report/rows?lac=${encodeURIComponent(lac)}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    loadLacs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) loadRows(selected);
    else setRows([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function doImport(file) {
    if (!isAdmin) {
      showToast('Seul un administrateur peut importer le fichier Report.');
      return;
    }
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const r = await api.upload('/report/import', file);
      setLastImport(r);
      const added = r.count ?? 0;
      const skipped = r.skipped ?? 0;
      showToast(
        skipped
          ? `${added} ligne(s) ajoutée(s) · ${skipped} déjà présente(s) · ${r.lacs} LAC · ${r.matched} corrélée(s) aux clients`
          : `Import : ${added} ligne(s) · ${r.lacs} LAC · ${r.matched} corrélée(s) aux clients`
      );
      await loadLacs('');
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

  const sumUsers = sortedRows.reduce((a, r) => a + (Number(r.total_quantity) || 0), 0);

  async function handleDeleteRow() {
    if (!confirmRow) return;
    setDeleting(true);
    setError('');
    try {
      await api.del(`/report/rows/${confirmRow.id}`);
      showToast(`Ligne supprimée : ${confirmRow.feature || confirmRow.license_id || confirmRow.id}`);
      setConfirmRow(null);
      if (selected) loadRows(selected);
    } catch (e) {
      setError(e.message);
      setConfirmRow(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h2>Report</h2>
          <div className="sub">Détail des licences par LAC (export portail Unify — CSV ou XLSX)</div>
        </div>
        <div className="toolbar">
          <select className="select" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={loading || loadingRows}>
            <option value="">— LAC —</option>
            {lacs.map((l) => (
              <option key={l.lac} value={l.lac}>
                {l.lac} ({l.n} ligne{l.n > 1 ? 's' : ''}, {l.users} user{l.users > 1 ? 's' : ''}
                {l.last_act ? ` · act. ${formatDate(l.last_act)}` : ''})
              </option>
            ))}
          </select>
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx" style={{ display: 'none' }} onChange={onFileChosen} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
            Importer le fichier
          </button>
          {isAdmin && (
            <button className="btn btn-danger" onClick={() => setConfirmClear(true)} disabled={importing || clearing} title="Supprimer toutes les données du Report">
              <Trash2 size={15} /> Vider le report
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {toast && <div className="toast">{toast}</div>}

      <div
        ref={wrapRef}
        className={`table-wrap report-wrap${dragOver ? ' drag-over' : ''}`}
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
        ) : !lacs.length ? (
          <div className="empty-state">
            <FileSpreadsheet size={28} />
            <p>Aucune donnée importée. <br />Glissez-déposez un fichier CSV ou XLSX de licences (portail Unify) sur cette table pour l'importer.</p>
          </div>
        ) : selected && loadingRows ? (
          <div className="empty-state"><span className="spinner" /></div>
        ) : sortedRows.length === 0 ? (
          <div className="empty-state">Aucun enregistrement</div>
        ) : (
          <table className="table table-compact report-bordered">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    style={{ width: colWidths[c.key], textAlign: c.center ? 'center' : 'left' }}
                    onClick={() => { if (!dragRef.current) onSort(c.key); }}
                  >
                    <span className="th-label">{c.label}</span>
                    <span className="th-sort">{sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                    <span
                      className="col-resize-handle"
                      onMouseDown={(e) => startResize(e, c.key)}
                      onDoubleClick={(e) => { e.stopPropagation(); resetColWidth(c.key); }}
                      title="Glisser pour redimensionner · Double-clic : largeur par défaut"
                    />
                  </th>
                ))}
                {isAdmin && (
                  <th style={{ width: 50, textAlign: 'center' }} title="Supprimer la ligne">Act.</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.id}>
                  {COLUMNS.map((c) => {
                    const cellText = c.key === 'create_date' ? formatDate(r[c.key])
                      : c.key === 'total_quantity' ? (Number(r[c.key]) || 0).toLocaleString('fr-FR')
                      : r[c.key] ?? '—';
async function handleClearAll() {
    setClearing(true);
    setError('');
    try {
      const r = await api.del('/report/rows');
      showToast(`${r.deleted} ligne(s) supprimée(s) du Report`);
      setConfirmClear(false);
      await loadLacs('');
      setRows([]);
    } catch (e) {
      setError(e.message);
      setConfirmClear(false);
    } finally {
      setClearing(false);
    }
  }

  return (
                      <td key={c.key} style={c.center ? { textAlign: 'center' } : undefined} title={cellText}>
                        {cellText}
                      </td>
                    );
                  })}
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
                <td colSpan={4}>Total ({sortedRows.length} position{sortedRows.length > 1 ? 's' : ''})</td>
                <td colSpan={1} style={{ textAlign: 'center', fontWeight: 700 }}>
                  {sumUsers.toLocaleString('fr-FR')}
                </td>
                <td colSpan={8 + (isAdmin ? 1 : 0)}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {lastImport && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 10 }}>
          Dernier import : {lastImport.count} ajoutée(s){lastImport.skipped ? ` · ${lastImport.skipped} déjà présente(s)` : ''} · {lastImport.lacs} LAC · {lastImport.matched} lignes corrélées aux clients
        </p>
      )}

      {confirmRow && (
        <ConfirmDialog
          title="Supprimer cette ligne ?"
          message={`LAC ${confirmRow.lac} — ${confirmRow.feature || confirmRow.feature_name_code || ''}${confirmRow.customer ? ` — ${confirmRow.customer}` : ''}`.trim()}
          onCancel={() => !deleting && setConfirmRow(null)}
          onConfirm={handleDeleteRow}
          loading={deleting}
        />
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Supprimer toutes les données du Report ?"
          message="Cette action supprime définitivement toutes les lignes de licences de toutes les LAC. Le fichier source devra être réimporté si besoin."
          confirmLabel="Tout supprimer"
          onCancel={() => !clearing && setConfirmClear(false)}
          onConfirm={handleClearAll}
          loading={clearing}
        />
      )}
    </div>
  );
}