import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../api.js';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function TCD() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [years, setYears] = useState([]);
  const [rows, setRows] = useState([]);
  const [year, setYear] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await api.get('/tcd');
        if (cancelled) return;
        const ys = [...(data.years || [])].sort((a, b) => String(a).localeCompare(String(b)));
        setYears(ys);
        setRows(data.rows || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(
    () => (year ? rows.filter((r) => String(r.annee) === year) : rows),
    [rows, year]
  );

  const groups = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      const y = String(r.annee);
      if (!map.has(y)) map.set(y, []);
      map.get(y).push(r);
    }
    return [...map.entries()]
      .map(([annee, months]) => ({
        annee,
        months: [...months].sort((a, b) => a.mois - b.mois),
        users: months.reduce((s, m) => s + (Number(m.users) || 0), 0),
        clients: months.reduce((s, m) => s + (Number(m.clients) || 0), 0),
      }))
      .sort((a, b) => a.annee.localeCompare(b.annee));
  }, [filtered]);

  const totalUsers = groups.reduce((a, g) => a + g.users, 0);
  const totalClients = groups.reduce((a, g) => a + g.clients, 0);

  function toggle(annee) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(annee)) next.delete(annee);
      else next.add(annee);
      return next;
    });
  }

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
        <select value={year} onChange={(e) => { setYear(e.target.value); setCollapsed(new Set()); }}>
          <option value="">Toutes les années</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {groups.length > 0 && (
          <span>
            {totalClients.toLocaleString('fr-FR')} client(s) — {totalUsers.toLocaleString('fr-FR')} utilisateur(s) à activer
          </span>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">Aucune licence à activer pour cette sélection.</div>
      ) : (
        <div className="report-wrap">
          <table className="table table-compact tcd">
            <thead>
              <tr>
                <th>Année / Mois</th>
                <th className="tcd-num">Nombre d'utilisateurs</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isCollapsed = collapsed.has(g.annee);
                return (
                  <React.Fragment key={g.annee}>
                    <tr className="tcd-year" onClick={() => toggle(g.annee)} title="Afficher / masquer les mois">
                      <td>
                        <span className="tcd-toggle">
                          {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        </span>
                        {g.annee}
                      </td>
                      <td className="tcd-num">{g.users.toLocaleString('fr-FR')}</td>
                    </tr>
                    {!isCollapsed && g.months.map((m) => (
                      <tr
                        key={`${m.annee}-${m.mois}`}
                        className="row-clickable"
                        title="Afficher les clients de ce mois"
                        onClick={() => openMonth(m)}
                      >
                        <td className="tcd-month">{MOIS[m.mois - 1] || m.mois}</td>
                        <td className="tcd-num">{Number(m.users).toLocaleString('fr-FR')}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="report-sum-row">
                <td>Total</td>
                <td className="tcd-num">{totalUsers.toLocaleString('fr-FR')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
