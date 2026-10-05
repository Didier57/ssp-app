import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { ScrollText, RefreshCw } from 'lucide-react';

const CAT_NAMES = {
  login: 'Connexions',
  user: 'Utilisateurs',
  profile: 'Profils',
  customer: 'Clients',
  file: 'Fichiers',
  license: 'Licences',
  settings: 'Paramètres',
  backup: 'Sauvegarde',
  general: 'Divers'
};

const CAT_BADGE = {
  login: 'badge-blue',
  user: 'badge-orange',
  profile: 'badge-gray',
  customer: 'badge-green',
  file: 'badge-gray',
  license: 'badge-blue',
  settings: 'badge-orange',
  backup: 'badge-gray',
  general: 'badge-gray'
};

const LIMITS = [100, 200, 500, 1000, 2000];

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metaUsers, setMetaUsers] = useState([]);
  const [metaCategories, setMetaCategories] = useState([]);

  const [userFilter, setUserFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(200);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (userFilter) params.set('user', userFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    if (fromFilter) params.set('from', fromFilter);
    if (toFilter) params.set('to', toFilter);
    if (search.trim()) params.set('search', search.trim());
    api.get(`/activity?${params.toString()}`)
      .then((data) => { if (!cancelled) setLogs(data || []); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userFilter, categoryFilter, fromFilter, toFilter, search, limit]);

  useEffect(() => {
    api.get('/activity/meta').then((meta) => {
      setMetaUsers(meta.users || []);
      setMetaCategories(meta.categories || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  function resetFilters() {
    setUserFilter('');
    setCategoryFilter('');
    setFromFilter('');
    setToFilter('');
    setSearch('');
  }

  const hasFilters = userFilter || categoryFilter || fromFilter || toFilter || search;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2><ScrollText size={20} /> Journal des logs</h2>
          <div className="sub">Historique complet des actions effectuées dans l'application</div>
        </div>
        <div className="row-actions">
          <label className="log-autorefresh" title="Recharger automatiquement toutes les 15 secondes">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto
          </label>
          <button className="btn btn-sm btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> Actualiser
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="panel">
        <div className="toolbar">
          <input
            type="text"
            placeholder="Rechercher (action, cible, détail, utilisateur)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="">Tous les utilisateurs</option>
            {metaUsers.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Toutes les catégories</option>
            {metaCategories.map((c) => <option key={c} value={c}>{CAT_NAMES[c] || c}</option>)}
          </select>
          <span className="toolbar-date">
            <label className="toolbar-date-label">
              Du
              <input type="date" value={fromFilter} onChange={(e) => setFromFilter(e.target.value)} />
            </label>
            <span className="toolbar-date-sep">→</span>
            <label className="toolbar-date-label">
              au
              <input type="date" value={toFilter} onChange={(e) => setToFilter(e.target.value)} />
            </label>
          </span>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} title="Nombre d'entrées affichées">
            {LIMITS.map((n) => <option key={n} value={n}>{n} entrées</option>)}
          </select>
          {hasFilters && (
            <button className="btn btn-sm btn-ghost" onClick={resetFilters}>Réinitialiser</button>
          )}
        </div>

        <div className="table-wrap">
          {loading ? (
            <div className="empty-state"><span className="spinner" /></div>
          ) : logs.length === 0 ? (
            <div className="empty-state">Aucune activité enregistrée pour ces critères.</div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>Date et heure</th>
                    <th style={{ width: 140 }}>Utilisateur</th>
                    <th style={{ width: 120 }}>Catégorie</th>
                    <th style={{ width: 240 }}>Action</th>
                    <th>Cible / détail</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className={l.category === 'login' && l.action.startsWith('Échec') ? 'cell-red' : ''}>
                      <td className="nowrap">{l.created_at ? l.created_at.slice(0, 19) : '—'}</td>
                      <td>{l.username || '—'}</td>
                      <td><span className={`badge ${CAT_BADGE[l.category] || 'badge-gray'}`}>{CAT_NAMES[l.category] || l.category}</span></td>
                      <td className="nowrap">{l.action}</td>
                      <td>
                        {l.target ? <b>{l.target}</b> : null}
                        {l.detail ? <span className="field-hint"> — {l.detail}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="log-count">{logs.length} entrée{logs.length > 1 ? 's' : ''} affichée{logs.length > 1 ? 's' : ''}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
