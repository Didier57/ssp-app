import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { DatabaseBackup, Download, Mail, Upload, FileSpreadsheet, ShieldAlert, FileArchive, Trash2, Database, HardDrive, PlugZap, Save, RefreshCw, RotateCcw } from 'lucide-react';
import { formatDate } from '../utils.js';

const SMB_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function formatDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return v;
  return d.toLocaleDateString('fr-FR') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

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
  const sqlRef = useRef(null);
  const [confirmSql, setConfirmSql] = useState(null);
  const [importingSql, setImportingSql] = useState(false);

  const [smbCfg, setSmbCfg] = useState({
    host: '', share: '', username: '', domain: '', path: '', password: '',
    passSet: false, enabled: false, day: 7, hour: 3, keep: 7
  });
  const [smbLast, setSmbLast] = useState({ at: '', status: '', message: '' });
  const [smbFiles, setSmbFiles] = useState([]);
  const [smbBusy, setSmbBusy] = useState('');
  const [smbStatus, setSmbStatus] = useState('');
  const [confirmSmbDelete, setConfirmSmbDelete] = useState(null);
  const [confirmSmbRestore, setConfirmSmbRestore] = useState(null);
  const [smbDeleting, setSmbDeleting] = useState(false);
  const [smbRestoring, setSmbRestoring] = useState(false);

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

  async function handleExportSql() {
    setBusy('sql');
    setError('');
    try {
      await api.download('/backup/sql');
      showToast('Export SQL de la base généré');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  function onSqlChosen(e) {
    const f = e.target.files && e.target.files[0];
    if (f) setConfirmSql(f);
    e.target.value = '';
  }

  async function handleImportSql() {
    if (!confirmSql) return;
    setImportingSql(true);
    setError('');
    try {
      const r = await api.upload('/backup/import-sql', confirmSql);
      showToast(r.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setImportingSql(false);
      setConfirmSql(null);
    }
  }

  async function loadSmbConfig() {
    try {
      const c = await api.get('/backup/smb/config');
      setSmbCfg((prev) => ({
        ...prev,
        host: c.host || '',
        share: c.share || '',
        username: c.username || '',
        domain: c.domain || '',
        path: c.path || '',
        passSet: !!c.passSet,
        enabled: !!c.enabled,
        day: c.day ?? 7,
        hour: c.hour ?? 3,
        keep: c.keep ?? 7
      }));
      setSmbLast({ at: c.lastBackupAt || '', status: c.lastStatus || '', message: c.lastMessage || '' });
    } catch (e) {
      /* config non lisible — ignorer */
    }
  }

  async function loadSmbFiles() {
    try {
      const r = await api.get('/backup/smb/files');
      setSmbFiles(r.files || []);
    } catch (e) {
      setSmbFiles([]);
    }
  }

  useEffect(() => {
    loadSmbConfig();
    loadSmbFiles();
  }, []);

  async function handleSmbTest() {
    setSmbBusy('test');
    setSmbStatus('');
    setError('');
    try {
      const r = await api.post('/backup/smb/test', smbCfg);
      setSmbStatus(r.message);
      showToast(r.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setSmbBusy('');
    }
  }

  async function handleSmbSave() {
    setSmbBusy('save');
    setError('');
    try {
      await api.post('/backup/smb/config', smbCfg);
      showToast('Configuration SMB enregistrée');
    } catch (e) {
      setError(e.message);
    } finally {
      setSmbBusy('');
    }
  }

  async function handleSmbBackupNow() {
    setSmbBusy('now');
    setError('');
    try {
      const r = await api.post('/backup/smb/backup-now');
      showToast(r.message);
      loadSmbFiles();
      loadSmbConfig();
    } catch (e) {
      setError(e.message);
    } finally {
      setSmbBusy('');
    }
  }

  async function handleSmbDelete() {
    if (!confirmSmbDelete) return;
    setSmbDeleting(true);
    setError('');
    try {
      await api.post('/backup/smb/delete', { name: confirmSmbDelete.name });
      showToast(`« ${confirmSmbDelete.name} » supprimé`);
      loadSmbFiles();
    } catch (e) {
      setError(e.message);
    } finally {
      setSmbDeleting(false);
      setConfirmSmbDelete(null);
    }
  }

  async function handleSmbRestore() {
    if (!confirmSmbRestore) return;
    setSmbRestoring(true);
    setError('');
    try {
      const r = await api.post('/backup/smb/restore', { name: confirmSmbRestore.name });
      showToast(r.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setSmbRestoring(false);
      setConfirmSmbRestore(null);
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

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">
          <Database size={16} /> Sauvegarde SQL (base de données)
        </div>
        <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
          Export complet de la base au format SQL : toutes les tables, y compris le contenu binaire
          des fichiers de licence. Ce format permet une restauration complète et fidèle de la base.
        </p>
        <div className="backup-actions">
          <button className="btn btn-primary" onClick={handleExportSql} disabled={!!busy}>
            <Database size={16} />&nbsp;{busy === 'sql' ? <span className="spinner" /> : <Download size={15} />}&nbsp;<span>Exporter la base (SQL)</span>
          </button>
          <button className="btn btn-ghost" onClick={() => sqlRef.current.click()} disabled={!!busy}>
            <Upload size={15} /> Importer un fichier SQL…
          </button>
          <input ref={sqlRef} type="file" accept=".sql,application/sql,text/plain" style={{ display: 'none' }} onChange={onSqlChosen} />
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">
          <HardDrive size={16} /> Sauvegarde automatique (SMB)
        </div>
        <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
          Configurez l'accès à un partage réseau SMB (ex. NAS) pour y déposer automatiquement une
          sauvegarde SQL de la base, selon un planning (jour de la semaine, heure) avec rotation
          (nombre de sauvegardes à conserver).
        </p>
        <div className="form-row">
          <div className="field">
            <label>Serveur (hôte ou IP)</label>
            <input type="text" value={smbCfg.host} onChange={(e) => setSmbCfg({ ...smbCfg, host: e.target.value })} placeholder="192.168.1.10" />
          </div>
          <div className="field">
            <label>Partage</label>
            <input type="text" value={smbCfg.share} onChange={(e) => setSmbCfg({ ...smbCfg, share: e.target.value })} placeholder="backup" />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>Utilisateur</label>
            <input type="text" value={smbCfg.username} onChange={(e) => setSmbCfg({ ...smbCfg, username: e.target.value })} autoComplete="off" />
          </div>
          <div className="field">
            <label>Mot de passe</label>
            <input type="password" value={smbCfg.password} onChange={(e) => setSmbCfg({ ...smbCfg, password: e.target.value })} placeholder={smbCfg.passSet ? '•••••• (laisser vide pour conserver)' : ''} autoComplete="new-password" />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>Domaine (optionnel)</label>
            <input type="text" value={smbCfg.domain} onChange={(e) => setSmbCfg({ ...smbCfg, domain: e.target.value })} />
          </div>
          <div className="field">
            <label>Sous-dossier sur le partage (optionnel)</label>
            <input type="text" value={smbCfg.path} onChange={(e) => setSmbCfg({ ...smbCfg, path: e.target.value })} placeholder="ssp-backups" />
          </div>
        </div>
        <div className="form-row">
          <div className="field field-check">
            <label className="check-label">
              <input type="checkbox" checked={smbCfg.enabled} onChange={(e) => setSmbCfg({ ...smbCfg, enabled: e.target.checked })} />
              Activer le backup automatique
            </label>
          </div>
          <div className="field">
            <label>Jour de la semaine</label>
            <select value={smbCfg.day} onChange={(e) => setSmbCfg({ ...smbCfg, day: parseInt(e.target.value, 10) })}>
              <option value={7}>Tous les jours</option>
              {SMB_DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Heure</label>
            <select value={smbCfg.hour} onChange={(e) => setSmbCfg({ ...smbCfg, hour: parseInt(e.target.value, 10) })}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}h00</option>)}
            </select>
          </div>
          <div className="field">
            <label>Sauvegardes à garder</label>
            <input type="number" min="1" max="100" value={smbCfg.keep} onChange={(e) => setSmbCfg({ ...smbCfg, keep: parseInt(e.target.value, 10) || 7 })} />
          </div>
        </div>
        <div className="backup-actions">
          <button className="btn btn-ghost" onClick={handleSmbTest} disabled={!!smbBusy}>
            <PlugZap size={15} /> Tester la connexion
          </button>
          <button className="btn btn-ghost" onClick={handleSmbSave} disabled={!!smbBusy}>
            <Save size={15} /> Enregistrer
          </button>
          <button className="btn btn-primary" onClick={handleSmbBackupNow} disabled={!!smbBusy}>
            <Database size={15} /> Sauvegarder maintenant
          </button>
        </div>
        {smbStatus && <div className="success-banner" style={{ marginTop: 12 }}>{smbStatus}</div>}
        {smbLast.at && (
          <p className="panel-sub">
            Dernier backup : {formatDateTime(smbLast.at)} — {smbLast.status === 'ok' ? 'succès' : 'échec'}
            {smbLast.message ? ` (${smbLast.message})` : ''}
          </p>
        )}

        <div className="panel-title" style={{ marginTop: 20 }}>
          <RefreshCw size={16} /> Fichiers sur le serveur SMB
        </div>
        <div className="backup-actions">
          <button className="btn btn-ghost" onClick={loadSmbFiles}><RefreshCw size={15} /> Rafraîchir la liste</button>
        </div>
        {smbFiles.length === 0 ? (
          <p className="panel-sub">Aucune sauvegarde trouvée sur le serveur SMB.</p>
        ) : (
          <table className="table table-compact" style={{ marginTop: 8 }}>
            <thead><tr><th>Fichier</th><th>Date</th><th style={{ width: 150 }}></th></tr></thead>
            <tbody>
              {smbFiles.map((f) => (
                <tr key={f.name}>
                  <td>{f.name}</td>
                  <td>{formatDate(f.mtime)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-xs btn-ghost" onClick={() => setConfirmSmbRestore({ name: f.name })} title="Restaurer cette sauvegarde">
                        <RotateCcw size={13} /> Restaurer
                      </button>
                      <button className="btn btn-xs btn-danger-ghost" onClick={() => setConfirmSmbDelete({ name: f.name })} title="Supprimer">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

      {confirmSql && (
        <ConfirmDialog
          title="Restaurer la base depuis un fichier SQL ?"
          message={`Le fichier « ${confirmSql.name} » va remplacer l'intégralité de la base de données actuelle. Confirmez-vous la restauration ?`}
          confirmLabel="Restaurer"
          loading={importingSql}
          onCancel={() => setConfirmSql(null)}
          onConfirm={handleImportSql}
        />
      )}

      {confirmSmbRestore && (
        <ConfirmDialog
          title="Restaurer depuis une sauvegarde SMB ?"
          message={`La sauvegarde « ${confirmSmbRestore.name} » va remplacer l'intégralité de la base de données actuelle. Cette action est irréversible. Confirmez-vous la restauration ?`}
          confirmLabel="Restaurer"
          loading={smbRestoring}
          onCancel={() => setConfirmSmbRestore(null)}
          onConfirm={handleSmbRestore}
        />
      )}

      {confirmSmbDelete && (
        <ConfirmDialog
          title="Supprimer une sauvegarde SMB ?"
          message={`Le fichier « ${confirmSmbDelete.name} » sera définitivement supprimé du serveur SMB. Confirmez-vous ?`}
          confirmLabel="Supprimer"
          loading={smbDeleting}
          onCancel={() => setConfirmSmbDelete(null)}
          onConfirm={handleSmbDelete}
        />
      )}
    </div>
  );
}