import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function TCD() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [years, setYears] = useState([]);
  const [rows, setRows] = useState([]);
  const [year, setYear] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await api.get('/tcd');
        if (cancelled) return;
        const ys = [...(data.years || [])].sort((a, b) => String(b).localeCompare(String(a)));
        setYears(ys);
        setRows(data.rows || []);
        const current = String(new Date().getFullYear());
        setYear(ys.includes(current) ? current : (ys[0] || ''));
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!year) return;
      setLoading(true);
      setError('');
      try {
        const data = await api.get(`/tcd?year=${encodeURIComponent(year)}`);
        if (!cancelled) setRows(data.rows || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [year]);

  const totalUsers = rows.reduce((a, r) => a + (Number(r.users) || 0), 0);
  const totalClients = rows.reduce((a, r) => a + (Number(r.clients) || 0), 0);

  function openMonth(r) {
    const mm = String(r.mois).padStart(2, '0');
    navigate(`/clients?exp=${encodeURIComponent(`${r.annee}-${mm}`)}`);
  }

  if (loading) return <div className="empty-state"><span className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>TCD — Renouvellements sous contrat</h2>
          <div className="sub">Clients avec contrat — nombre d'utilisateurs à activer par mois (fin de licence)</div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          {!years.includes(year) && <option value="">Toutes les années</option>}
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {!loading && rows.length > 0 && (
          <span>
            {year ? `${rows.length} mois — ` : ''}{totalClients} client(s) — {totalUsers.toLocaleString('fr-FR')} utilisateur(s) à activer
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">Aucune licence à activer pour cette sélection.</div>
      ) : (
        <div className="report-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Année</th>
                <th>Mois</th>
                <th>Utilisateurs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.annee}-${r.mois}`}
                  className="row-clickable"
                  title="Afficher les clients de ce mois"
                  onClick={() => openMonth(r)}
                >
                  <td>{r.annee}</td>
                  <td>{MOIS[r.mois - 1] || r.mois}</td>
                  <td>{Number(r.users).toLocaleString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="report-sum-row">
                <td colSpan="2">Total</td>
                <td>{totalUsers.toLocaleString('fr-FR')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}