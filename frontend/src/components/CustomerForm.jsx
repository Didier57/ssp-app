import React, { useState } from 'react';
import { api } from '../api.js';

const FIELDS = [
  { key: 'customer', label: 'Customer', type: 'text', required: true, full: false },
  { key: 'customer_site', label: 'Customer site', type: 'text', required: false, full: false },
  { key: 'date_end_licence', label: 'Date fin licence', type: 'date', required: false, full: false },
  { key: 'product', label: 'Product', type: 'text', required: false, full: false },
  { key: 'mac_address', label: 'MAC address', type: 'text', required: false, full: false },
  { key: 'lic_35', label: 'LIC 3/5', type: 'number', required: false, full: false },
  { key: 'siel_id', label: 'SIEL ID', type: 'text', required: false, full: false },
  { key: 'registered_company', label: 'Société enregistrée', type: 'text', required: false, full: false },
  { key: 'number_user', label: 'Nb utilisateurs', type: 'number', required: false, full: false },
  { key: 'contract', label: 'Contrat actif', type: 'select', options: [{ v: 1, l: 'Oui' }, { v: 0, l: 'Non' }], full: false },
  { key: 'last_lac', label: 'Last LAC', type: 'text', required: false, full: false },
  { key: 'date_last_lac', label: 'Date last LAC', type: 'date', required: false, full: false },
  { key: 'udl_contract', label: 'UDL Contract', type: 'text', required: false, full: false },
  { key: 'dlu_contract', label: 'DLU Contract', type: 'text', required: false, full: false },
  { key: 'info_divers', label: 'Information', type: 'textarea', required: false, full: true }
];

export default function CustomerForm({ customer, onClose, onSaved }) {
  const isEdit = !!customer.id;
  const [form, setForm] = useState(() => {
    const init = {};
    for (const f of FIELDS) {
      let v = customer[f.key] ?? '';
      if (f.type === 'date' && v && typeof v === 'string' && v.includes('-')) v = v.slice(0, 10);
      init[f.key] = v;
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.customer.trim()) {
      setError('Le champ Customer est obligatoire.');
      return;
    }
    setSaving(true);
    const body = {};
    for (const f of FIELDS) {
      let v = form[f.key];
      if (v === '' || v == null) {
        body[f.key] = null;
      } else if (f.type === 'number') {
        body[f.key] = Number(v);
      } else if (f.type === 'select') {
        body[f.key] = Number(v);
      } else if (f.type === 'date' && v) {
        body[f.key] = typeof v === 'string' && v.includes('-') && v.length >= 10 ? v.slice(0, 10) : v;
      } else {
        body[f.key] = v;
      }
    }
    try {
      if (isEdit) {
        await api.put(`/customers/${customer.id}`, body);
      } else {
        await api.post('/customers', body);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'Modifier le client' : 'Ajouter un client'}</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner full">{error}</div>}
            {FIELDS.map((f) => (
              <div className={`field ${f.full ? 'full' : ''}`} key={f.key}>
                <label>{f.label}{f.required ? ' *' : ''}</label>
                {f.type === 'select' ? (
                  <select value={form[f.key] === '' ? '' : String(form[f.key])} onChange={(e) => update(f.key, e.target.value === '' ? '' : Number(e.target.value))}>
                    <option value="">—</option>
                    {f.options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea rows={3} value={form[f.key] ?? ''} onChange={(e) => update(f.key, e.target.value)} />
                ) : (
                  <input
                    type={f.type}
                    value={form[f.key] ?? ''}
                    onChange={(e) => update(f.key, e.target.value)}
                    step={f.type === 'number' ? '1' : undefined}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}