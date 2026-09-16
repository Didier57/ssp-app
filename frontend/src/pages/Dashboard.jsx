import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Legend
} from 'recharts';
import { api } from '../api.js';
import { formatDate, daysUntil } from '../utils.js';

const COLORS = ['#1d4ed8', '#7c3aed', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#db2777'];

function PieLabel(props) {
  const { cx, cy, midAngle, innerRadius = 0, outerRadius, value, percent } = props;
  if (!value) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.42;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={15}
      fontWeight={700}
      paintOrder="stroke"
      stroke="rgba(0,0,0,0.35)"
      strokeWidth={2}
    >
      {value}
    </text>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [expiring, setExpiring] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setError(e.message));
    api.get('/dashboard/expiring').then(setExpiring).catch(() => {});
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <div className="empty-state"><span className="spinner" /></div>;

  const soon = expiring.slice(0, 10);

  const sumSeries = (arr) => (arr || []).reduce((a, d) => a + (Number(d.value) || 0), 0);
  const totalAll = sumSeries(data.bySize);
  const totalContract = sumSeries(data.bySizeContract);
  const totalNoContract = sumSeries(data.bySizeNoContract);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <div className="sub">Vue d'ensemble des licences Openscape Business</div>
        </div>
      </div>

      <div className="cards">
        <div className="stat-card">
          <div className="label">Clients</div>
          <div className="value blue">{data.total}</div>
        </div>
        <div className="stat-card">
          <div className="label">Contrats actifs</div>
          <div className="value green">{data.activeContracts}</div>
        </div>
        <div className="stat-card">
          <div className="label">Contrats annulés</div>
          <div className="value red">{data.cancelledContracts}</div>
        </div>
        <div className="stat-card">
          <div className="label">Expirations &lt; 90 jours</div>
          <div className="value orange">{data.expiring90}</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="panel">
          <h3>Gamme de produit — Tous <span className="charts-total">{totalAll.toLocaleString('fr-FR')} produits</span></h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data.bySize} dataKey="value" nameKey="key" cx="50%" cy="50%" outerRadius={95} label={PieLabel} labelLine={false}>
                {data.bySize.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h3>Gamme de produit — Avec contrat <span className="charts-total">{totalContract.toLocaleString('fr-FR')} produits</span></h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data.bySizeContract} dataKey="value" nameKey="key" cx="50%" cy="50%" outerRadius={95} label={PieLabel} labelLine={false}>
                {data.bySizeContract.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h3>Gamme de produit — Sans contrat <span className="charts-total">{totalNoContract.toLocaleString('fr-FR')} produits</span></h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data.bySizeNoContract} dataKey="value" nameKey="key" cx="50%" cy="50%" outerRadius={95} label={PieLabel} labelLine={false}>
                {data.bySizeNoContract.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="charts-grid">
        <div className="panel">
          <h3>Expirations à venir (6 mois)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.expirations}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mois" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="n" name="Clients" fill="#1d4ed8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel">
        <div className="page-header" style={{ marginBottom: 10 }}>
          <h3>Prochaines expirations</h3>
          <Link to="/clients"><button className="btn btn-sm btn-ghost">Voir tous</button></Link>
        </div>
        {soon.length === 0 ? (
          <div className="empty-state">Aucune licence n'expire dans les 90 prochains jours.</div>
        ) : (
          <ul className="list-expiring">
            {soon.map((c) => {
              const d = daysUntil(c.date_end_licence);
              return (
                <li key={c.id}>
                  <span><b>{c.customer}</b> — {c.product}</span>
                  <span>
                    {formatDate(c.date_end_licence)}
                    {' '}
                    {d !== null && d <= 30
                      ? <span className="badge badge-red">J-{d}</span>
                      : <span className="badge badge-orange">J-{d}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}