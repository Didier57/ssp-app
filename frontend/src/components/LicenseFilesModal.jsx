import React, { useEffect, useState } from 'react';
import { api, getToken } from '../api.js';
import { formatDate } from '../utils.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import { Download, Trash2, X, FileArchive } from 'lucide-react';

export default function LicenseFilesModal({ customer, isAdmin, onClose, onChanged }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);

  async function load() {
    try {
      setError('');
      const rows = await api.get(`/customers/${customer.id}/files`);
      setFiles(rows || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [customer.id]);

  async function download(f) {
    try {
      const res = await fetch(`/api/customers/${customer.id}/files/${f.id}/download`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const blob = await res.blob();
      const saveAs = (await import('file-saver')).saveAs;
      saveAs(blob, f.filename);
    } catch (e) {
      setError(e.message);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/customers/${customer.id}/files/${deleting.id}`);
      setDeleting(null);
      setFiles((f) => f.filter((x) => x.id !== deleting.id));
      onChanged();
    } catch (e) {
      setError(e.message);
      setDeleting(null);
    }
  }

  function fmtSize(n) {
    if (!n && n !== 0) return '—';
    return n < 1024 ? `${n} o` : `${(n / 1024).toFixed(1)} Ko`;
  }

  function fmtDateTime(v) {
    if (!v) return '—';
    const m = String(v).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    return m ? `${m[1]} ${m[2]}` : formatDate(v);
  }

  // Tri : du plus récent au plus ancien
  const sorted = [...files].sort(
    (a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')) || b.id - a.id
  );

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <h3><FileArchive size={16} /> Fichiers licence — {customer.customer}</h3>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {loading ? (
          <div className="empty-state"><span className="spinner" /></div>
        ) : files.length === 0 ? (
          <div className="empty-state">Aucun fichier licence pour ce client.</div>
        ) : (
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Fichier</th>
                <th style={{ width: 90 }}>Taille</th>
                <th style={{ width: 150 }}>Ajouté le</th>
                <th style={{ width: 110 }}>Par</th>
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((f) => (
                <tr key={f.id}>
                  <td>{f.filename}</td>
                  <td>{fmtSize(f.size)}</td>
                  <td>{fmtDateTime(f.uploaded_at)}</td>
                  <td>{f.uploaded_by}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-xs btn-ghost" title="Télécharger" onClick={() => download(f)}>
                      <Download size={12} />
                    </button>
                    {isAdmin && (
                      <button className="btn btn-xs btn-danger-ghost" title="Supprimer" onClick={() => setDeleting(f)}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="modal-footer">
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Fermer</button>
        </div>
      </div>

      {deleting && (
        <ConfirmDialog
          title="Supprimer ce fichier ?"
          message={`« ${deleting.filename} » sera définitivement supprimé.`}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}