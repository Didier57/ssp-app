import React, { useRef, useState } from 'react';
import { api } from '../api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { DatabaseBackup, Download, Mail, Upload, FileSpreadsheet, ShieldAlert, FileArchive, Trash2 } from 'lucide-react';

export default function Backup() {
  const fileRef = useRef(null);
  const zipRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [confirmFile, setConfirmFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [confirmZip, setConfirmZip] = useState(null);
  const [importingZip, setImportingZip] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 4500);
  }

  async function handleExport() {
    setBusy('export');
    setError('');
    try {
      await api.download('/backup/export');
      showToast('Export Excel de la base généré');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function handleExportZip() {
    setBusy('zip');
    setError('');
    try {
      await api.download('/backup/files');
      showToast('Export ZIP des fichiers de licence généré');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function handleSend() {
    setBusy('send');
    setError('');
    try {
      const r = await api.post('/backup/send');
      showToast(r.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  function onFileChosen(e) {
    const f = e.target.files && e.target.files[0];
    if (f) setConfirmFile(f);
    e.target.value = '';
  }

  function onZipChosen(e) {
    const f = e.target.files && e.target.files[0];
    if (f) setConfirmZip(f);
    e.target.value = '';
  }

  async function handleImport() {
    if (!confirmFile) return;
    setImporting(true);
    setError('');
    try {
      const r = await api.upload('/backup/import', confirmFile);
      showToast(r.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
      setConfirmFile(null);
    }
  }

  async function handleImportZip() {
    if (!confirmZip) return;
    setImportingZip(true);
    setError('');
    try {
      const r = await api.upload('/backup/import-files', confirmZip);
      showToast(r.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setImportingZip(false);
      setConfirmZip(null);
    }
  }

  async function handleCleanup() {
    setPurging(true);
    setError('');
    try {
      const r = await api.post('/backup/cleanup-files');
      showToast(r.deleted > 0
        ? `${r.deleted} fichier(s) vide(s) supprimé(s)`
        : 'Aucun fichier vide à supprimer');
    } catch (e) {
      setError(e.message);
    } finally {
      setPurging(false);
      setConfirmPurge(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h2>Sauvegarde</h2>
          <div className="sub">Exporter, restaurer ou envoyer la base de données au format Excel</div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {toast && <div className="toast">{toast}</div>}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">
          <DatabaseBackup size={16} /> Base de données complète
        </div>
        <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
          Le fichier Excel contient un onglet par table (Clients, Utilisateurs, Derniers LAC, Paramètres…).
          Les fichiers de licence (contenu binaire) ne sont pas stockés dans Excel : leur liste est sauvegardée
          mais le contenu ne peut pas être restauré depuis ce format.
        </p>
        <div className="backup-actions">
          <button className="btn btn-primary" onClick={handleExport} disabled={!!busy}>
            <DatabaseBackup size={16} />&nbsp;{busy === 'export' ? <span className="spinner" /> : <Download size={15} />}&nbsp;<span>Exporter vers Excel</span>
          </button>
          <button className="btn btn-ghost" onClick={handleSend} disabled={!!busy}>
            <Mail size={15} />
            {busy === 'send' && <span className="spinner" />}
            Envoyer la base par email
          </button>
          <button className="btn btn-ghost" onClick={() => fileRef.current.click()} disabled={!!busy}>
            <Upload size={15} /> Importer un fichier Excel…
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: 'none' }} onChange={onFileChosen} />
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">
          <FileArchive size={16} /> Fichiers de licence
        </div>
        <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
          Le fichier ZIP contient tous les fichiers de licence (contenu binaire) accompagnés d'un
          manifeste. Il permet de restaurer ces fichiers après un incident (ex. réimport après une
          restauration Excel, qui ne contient que la liste des fichiers sans leur contenu).
        </p>
        <div className="backup-actions">
          <button className="btn btn-primary" onClick={handleExportZip} disabled={!!busy}>
            <FileArchive size={16} />&nbsp;{busy === 'zip' ? <span className="spinner" /> : <Download size={15} />}&nbsp;<span>Exporter les licences (ZIP)</span>
          </button>
          <button className="btn btn-ghost" onClick={() => zipRef.current.click()} disabled={!!busy}>
            <Upload size={15} /> Importer un fichier ZIP…
          </button>
          <input ref={zipRef} type="file" accept=".zip,application/zip" style={{ display: 'none' }} onChange={onZipChosen} />
          <button className="btn btn-danger-ghost" onClick={() => setConfirmPurge(true)} disabled={!!busy || purging}>
            <Trash2 size={15} /> Purger les fichiers vides (0 Ko)
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <FileSpreadsheet size={16} /> Restaurer après incident
        </div>
        <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
          L'import remplace tout le contenu actuel de la base par celui du fichier Excel choisi
          (un administrateur restera toujours présent en cas d'absence dans le fichier).
        </p>
        <div className="backup-warn">
          <ShieldAlert size={16} />
          <span>Cette action est irréversible : faites d'abord un export si la base actuelle est encore utilisable.</span>
        </div>
      </div>

      {confirmFile && (
        <ConfirmDialog
          title="Restaurer la base depuis un fichier Excel ?"
          message={`Le fichier « ${confirmFile.name} » va remplacer l'intégralité des données actuelles. Confirmez-vous l'import ?`}
          confirmLabel="Importer"
          loading={importing}
          onCancel={() => setConfirmFile(null)}
          onConfirm={handleImport}
        />
      )}

      {confirmZip && (
        <ConfirmDialog
          title="Restaurer les fichiers de licence depuis un ZIP ?"
          message={`Le fichier « ${confirmZip.name} » va réimporter les fichiers de licence. Les fichiers manquants seront ajoutés, les fichiers existants seront mis à jour. Confirmez-vous l'import ?`}
          confirmLabel="Importer"
          loading={importingZip}
          onCancel={() => setConfirmZip(null)}
          onConfirm={handleImportZip}
        />
      )}

      {confirmPurge && (
        <ConfirmDialog
          title="Purger les fichiers de licence vides (0 Ko) ?"
          message="Tous les fichiers de licence dont le contenu est vide (0 Ko) seront supprimés de la base. Ils ne seront plus affichés ni téléchargeables. Confirmez-vous ?"
          confirmLabel="Purger"
          loading={purging}
          onCancel={() => setConfirmPurge(false)}
          onConfirm={handleCleanup}
        />
      )}
    </div>
  );
}