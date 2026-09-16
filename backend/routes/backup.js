const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { buildBackupWorkbook, importBackup, buildFilesZip, importFilesZip, dumpSql, restoreFromSql, backupFilename, filesZipFilename, sqlFilename } = require('../backup');
const { sendMail, smtpConfigured } = require('../mailer');
const { logAudit } = require('../audit');
const { getSetting, setSetting, getBool, getInt } = require('../settings');
const smb = require('../smb');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const zipUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
const sqlUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const errMsg = (e) => (e && e.message ? e.message : String(e));

// GET /api/backup/export — télécharge le classeur complet de sauvegarde
router.get('/export', (req, res) => {
  const buf = buildBackupWorkbook();
  logAudit({ user: req.user, action: 'Export de la sauvegarde', category: 'backup', target: backupFilename() });
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${backupFilename()}"`);
  res.setHeader('Content-Length', buf.length);
  res.send(buf);
});

// GET /api/backup/files — télécharge le ZIP des fichiers de licence
router.get('/files', (req, res) => {
  const buf = buildFilesZip();
  logAudit({ user: req.user, action: 'Export des fichiers de licence (ZIP)', category: 'backup', target: filesZipFilename() });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filesZipFilename()}"`);
  res.setHeader('Content-Length', buf.length);
  res.send(buf);
});

// POST /api/backup/import-files — restaure les fichiers de licence depuis un ZIP
router.post('/import-files', zipUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Fichier ZIP manquant' });
  }
  try {
    const result = importFilesZip(req.file.buffer);
    const message = `${result.added} ajouté(s), ${result.updated} mis à jour, ${result.skipped} client(s) non trouvé(s), ${result.missing} sans contenu`;
    logAudit({ user: req.user, action: 'Restauration des fichiers de licence (ZIP)', category: 'backup', target: req.file.originalname });
    res.json({ ok: true, message, ...result });
  } catch (e) {
    res.status(400).json({ error: `Import ZIP impossible : ${e.message}` });
  }
});

// POST /api/backup/cleanup-files — purge les fichiers de licence vides (0 Ko)
router.post('/cleanup-files', (req, res) => {
  const result = db
    .prepare(`DELETE FROM customer_files WHERE content IS NULL OR length(content) = 0`)
    .run();
  logAudit({
    user: req.user,
    action: 'Purge des fichiers de licence vides (0 Ko)',
    category: 'file',
    detail: `${result.changes} fichier(s) supprimé(s)`
  });
  res.json({ ok: true, deleted: result.changes });
});

// GET /api/backup/sql — télécharge le dump SQL complet de la base
router.get('/sql', (req, res) => {
  const sql = dumpSql();
  logAudit({ user: req.user, action: 'Export de la base (SQL)', category: 'backup', target: sqlFilename() });
  const buf = Buffer.from(sql, 'utf8');
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="${sqlFilename()}"`);
  res.setHeader('Content-Length', buf.length);
  res.send(buf);
});

// POST /api/backup/import-sql — restaure la base depuis un dump SQL
router.post('/import-sql', sqlUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Fichier SQL manquant' });
  }
  try {
    const sql = req.file.buffer.toString('utf8');
    const result = restoreFromSql(sql);
    logAudit({ user: req.user, action: 'Restauration de la base (SQL)', category: 'backup', target: req.file.originalname });
    res.json({ ok: true, message: 'Base restaurée depuis le fichier SQL', ...result });
  } catch (e) {
    res.status(400).json({ error: `Import SQL impossible : ${e.message}` });
  }
});

// POST /api/backup/import — restaure la base depuis un classeur sauvegardé
router.post('/import', upload.single('file'), (req, res) => {  if (!req.file) {
    return res.status(400).json({ error: 'Fichier Excel manquant' });
  }
  try {
    const result = importBackup(req.file.buffer);
    logAudit({ user: req.user, action: 'Restauration de la base', category: 'backup', target: req.file.originalname });
    res.json({ ok: true, message: 'Base restaurée depuis le fichier Excel', ...result });
  } catch (e) {
    res.status(400).json({ error: `Import impossible : ${e.message}` });
  }
});

// POST /api/backup/send — envoie la sauvegarde Excel par email à l'admin demandeur
router.post('/send', async (req, res) => {
  if (!smtpConfigured()) {
    return res.status(400).json({ error: 'SMTP non configuré — rendez-vous dans Paramètres' });
  }
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  if (!user || !user.email) {
    return res.status(400).json({ error: "Aucune adresse email sur votre compte (menu Profil)" });
  }
  const to = user.email;
  try {
    const buf = buildBackupWorkbook();
    await sendMail({
      to,
      subject: `SSP Openscape — Sauvegarde de la base (${backupFilename()})`,
      html:
        '<p>Suite à votre demande, voici la sauvegarde complète de la base de données SSP Openscape.</p>' +
        `<p>Fichier : <b>${backupFilename()}</b></p>` +
        '<p>Conservez ce fichier : il permet de restaurer la base en cas de problème (page Sauvegarde → Importer).</p>',
      attachments: [{ filename: backupFilename(), content: buf }]
    });
    logAudit({ user: req.user, action: 'Sauvegarde envoyée par email', category: 'backup', target: backupFilename() });
    res.json({ ok: true, message: `Sauvegarde envoyée à ${to}` });
  } catch (e) {
    res.status(500).json({ error: `Envoi impossible : ${e.message}` });
  }
});

// ===== Sauvegarde automatique SMB =====

// GET /api/backup/smb/config — lit la configuration SMB (mot de passe masqué)
router.get('/smb/config', (req, res) => {
  const cfg = smb.getConfig();
  res.json({
    host: cfg.host,
    share: cfg.share,
    username: cfg.username,
    domain: cfg.domain,
    path: cfg.path,
    passSet: !!cfg.password,
    enabled: getBool('smb.enabled', false),
    day: getInt('smb.day', 7),
    hour: getInt('smb.hour', 3),
    keep: getInt('smb.keep', 7),
    lastBackupAt: getSetting('smb.last_backup_at', ''),
    lastStatus: getSetting('smb.last_backup_status', ''),
    lastMessage: getSetting('smb.last_backup_message', '')
  });
});

// POST /api/backup/smb/config — enregistre la configuration SMB
router.post('/smb/config', (req, res) => {
  const b = req.body || {};
  if (b.host !== undefined) setSetting('smb.host', b.host);
  if (b.share !== undefined) setSetting('smb.share', b.share);
  if (b.username !== undefined) setSetting('smb.username', b.username);
  if (b.domain !== undefined) setSetting('smb.domain', b.domain);
  if (b.path !== undefined) setSetting('smb.path', b.path);
  if (b.password !== undefined && String(b.password) !== '') setSetting('smb.password', b.password);
  if (b.enabled !== undefined) setSetting('smb.enabled', b.enabled ? '1' : '0');
  if (b.day !== undefined) {
    const d = parseInt(b.day, 10);
    setSetting('smb.day', Number.isNaN(d) ? 7 : Math.max(0, Math.min(7, d)));
  }
  if (b.hour !== undefined) {
    const h = parseInt(b.hour, 10);
    setSetting('smb.hour', Number.isNaN(h) ? 3 : Math.max(0, Math.min(23, h)));
  }
  if (b.keep !== undefined) {
    const k = parseInt(b.keep, 10);
    setSetting('smb.keep', Number.isNaN(k) ? 7 : Math.max(1, Math.min(100, k)));
  }
  logAudit({ user: req.user, action: 'Configuration de la sauvegarde SMB', category: 'settings' });
  res.json({ ok: true });
});

// POST /api/backup/smb/test — teste la connexion SMB (config fournie ou sauvegardée)
router.post('/smb/test', async (req, res) => {
  const b = req.body || {};
  const saved = smb.getConfig();
  const cfg = {
    host: b.host !== undefined ? b.host : saved.host,
    share: b.share !== undefined ? b.share : saved.share,
    username: b.username !== undefined ? b.username : saved.username,
    password: b.password !== undefined && b.password !== '' ? b.password : saved.password,
    domain: b.domain !== undefined ? b.domain : saved.domain,
    path: b.path !== undefined ? b.path : saved.path
  };
  try {
    const r = await smb.testConnection(cfg);
    logAudit({ user: req.user, action: 'Test de connexion SMB', category: 'settings', detail: 'succès' });
    res.json({ ok: true, message: `Connexion réussie (${r.entries} élément(s) dans le répertoire)` });
  } catch (e) {
    res.status(400).json({ ok: false, error: `Test échoué : ${errMsg(e)}` });
  }
});

// GET /api/backup/smb/files — liste les sauvegardes sur le serveur SMB
router.get('/smb/files', async (req, res) => {
  try {
    const files = await smb.listBackups();
    res.json({ ok: true, files });
  } catch (e) {
    res.status(400).json({ ok: false, error: errMsg(e) });
  }
});

// POST /api/backup/smb/backup-now — déclenche une sauvegarde SQL immédiate vers SMB
router.post('/smb/backup-now', async (req, res) => {
  try {
    const r = await smb.backupNow();
    logAudit({ user: req.user, action: 'Sauvegarde SMB manuelle', category: 'backup', target: r.filename });
    res.json({ ok: true, message: `Sauvegarde « ${r.filename} » envoyée sur le serveur SMB`, ...r });
  } catch (e) {
    res.status(400).json({ error: `Sauvegarde impossible : ${errMsg(e)}` });
  }
});

// POST /api/backup/smb/delete — supprime un fichier de sauvegarde SMB
router.post('/smb/delete', async (req, res) => {
  const name = req.body && req.body.name;
  if (!name) return res.status(400).json({ error: 'Nom de fichier manquant' });
  try {
    const r = await smb.deleteBackup(name);
    logAudit({ user: req.user, action: 'Suppression d\'une sauvegarde SMB', category: 'backup', target: name });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(400).json({ error: `Suppression impossible : ${errMsg(e)}` });
  }
});

// POST /api/backup/smb/restore — restaure la base depuis une sauvegarde SMB
router.post('/smb/restore', async (req, res) => {
  const name = req.body && req.body.name;
  if (!name) return res.status(400).json({ error: 'Nom de fichier manquant' });
  try {
    const result = await smb.restoreFromSmb(name);
    logAudit({ user: req.user, action: 'Restauration depuis une sauvegarde SMB', category: 'backup', target: name });
    res.json({ ok: true, message: `Base restaurée depuis « ${name} »`, ...result });
  } catch (e) {
    res.status(400).json({ error: `Restauration impossible : ${errMsg(e)}` });
  }
});

module.exports = router;