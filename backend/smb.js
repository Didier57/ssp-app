const SMB2 = require('@marsaud/smb2');
const { getSetting, setSetting, getBool, getInt } = require('./settings');
const { dumpSql, restoreFromSql } = require('./backup');

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const PREFIX = 'ssp_database_';

function getConfig() {
  return {
    host: getSetting('smb.host', ''),
    share: getSetting('smb.share', ''),
    username: getSetting('smb.username', ''),
    password: getSetting('smb.password', ''),
    domain: getSetting('smb.domain', ''),
    path: getSetting('smb.path', '')
  };
}

function isConfigured(cfg = getConfig()) {
  return !!(cfg && cfg.host && cfg.share && cfg.username);
}

function unc(cfg) {
  const host = String(cfg.host || '').trim().replace(/^\\+/, '');
  let share = String(cfg.share || '').trim().replace(/^\\+/, '').replace(/\/+/g, '\\');
  if (host && share.toLowerCase().startsWith(host.toLowerCase() + '\\')) {
    share = share.slice(host.length + 1);
  }
  return '\\\\' + host + '\\' + share;
}

function remotePath(cfg, name) {
  const base = String(cfg.path || '').trim().replace(/^\\+/, '').replace(/\/+/g, '\\').replace(/\\+$/, '');
  const n = String(name || '').replace(/^\\+/, '');
  if (!base) return n;
  return base + (n ? '\\' + n : '');
}

function createClient(cfg = getConfig()) {
  return new SMB2({
    share: unc(cfg),
    domain: cfg.domain || undefined,
    username: cfg.username,
    password: cfg.password,
    autoCloseTimeout: 0
  });
}

function safeDisconnect(client) {
  try {
    if (client && typeof client.disconnect === 'function') client.disconnect();
  } catch (e) {
    /* ignore */
  }
}

function safeName(name) {
  const n = String(name || '');
  if (!n || n.includes('\\') || n.includes('/') || n.includes('..')) {
    throw new Error('Nom de fichier invalide');
  }
  return n;
}

function formatTimestamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function testConnection(cfg = getConfig()) {
  if (!isConfigured(cfg)) {
    throw new Error('Configuration SMB incomplète (hôte, partage et utilisateur requis)');
  }
  const client = createClient(cfg);
  try {
    const dir = remotePath(cfg, '');
    if (dir) {
      const exists = await client.exists(dir);
      if (!exists) throw new Error(`Le sous-dossier « ${dir} » n'existe pas sur le partage`);
    }
    const entries = await client.readdir(dir || '', { stats: true });
    return { ok: true, entries: entries.length };
  } finally {
    safeDisconnect(client);
  }
}

async function listBackups(cfg = getConfig()) {
  if (!isConfigured(cfg)) throw new Error('Configuration SMB incomplète');
  const client = createClient(cfg);
  try {
    const dir = remotePath(cfg, '');
    const entries = await client.readdir(dir || '', { stats: true });
    const files = entries
      .filter((e) => e && typeof e.isDirectory === 'function' && !e.isDirectory())
      .filter((e) => e.name && e.name.startsWith(PREFIX) && e.name.endsWith('.sql'))
      .map((e) => ({ name: e.name, mtime: e.mtime ? e.mtime.toISOString() : null }));
    files.sort((a, b) => (b.mtime || '').localeCompare(a.mtime || ''));
    return files;
  } finally {
    safeDisconnect(client);
  }
}

async function deleteBackup(name, cfg = getConfig()) {
  if (!isConfigured(cfg)) throw new Error('Configuration SMB incomplète');
  const client = createClient(cfg);
  try {
    await client.unlink(remotePath(cfg, safeName(name)));
    return { ok: true, name };
  } finally {
    safeDisconnect(client);
  }
}

async function readBackup(name, cfg = getConfig()) {
  if (!isConfigured(cfg)) throw new Error('Configuration SMB incomplète');
  const client = createClient(cfg);
  try {
    const data = await client.readFile(remotePath(cfg, safeName(name)));
    return Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  } finally {
    safeDisconnect(client);
  }
}

async function applyRetention(cfg, keep) {
  const files = await listBackups(cfg);
  const toDelete = files.slice(Math.max(0, keep || 0));
  const deleted = [];
  for (const f of toDelete) {
    await deleteBackup(f.name, cfg);
    deleted.push(f.name);
  }
  return deleted;
}

async function backupNow(cfg = getConfig()) {
  if (!isConfigured(cfg)) throw new Error('Configuration SMB incomplète');
  const filename = `${PREFIX}${formatTimestamp(new Date())}.sql`;
  try {
    const sql = dumpSql();
    const client = createClient(cfg);
    try {
      await client.writeFile(remotePath(cfg, filename), Buffer.from(sql, 'utf8'));
    } finally {
      safeDisconnect(client);
    }
    const keep = getInt('smb.keep', 7);
    const deleted = await applyRetention(cfg, keep);
    setSetting('smb.last_backup_at', new Date().toISOString());
    setSetting('smb.last_backup_status', 'ok');
    setSetting('smb.last_backup_message', `Sauvegarde « ${filename} » envoyée`);
    return { ok: true, filename, deleted };
  } catch (err) {
    setSetting('smb.last_backup_status', 'error');
    setSetting('smb.last_backup_message', err.message);
    throw err;
  }
}

async function restoreFromSmb(name, cfg = getConfig()) {
  if (!isConfigured(cfg)) throw new Error('Configuration SMB incomplète');
  const buf = await readBackup(name, cfg);
  const sql = buf.toString('utf8');
  return restoreFromSql(sql);
}

function shouldRunNow() {
  if (!getBool('smb.enabled', false)) return false;
  if (!isConfigured()) return false;
  const now = new Date();
  const schedDay = getInt('smb.day', 7);
  if (schedDay !== 7 && schedDay !== now.getDay()) return false;
  if (now.getHours() !== getInt('smb.hour', 3)) return false;
  const last = getSetting('smb.last_backup_at', '');
  if (last) {
    const d = new Date(last);
    if (!isNaN(d.getTime()) &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate() &&
        d.getHours() === now.getHours()) {
      return false;
    }
  }
  return true;
}

async function maybeRunAutoBackup() {
  if (!shouldRunNow()) return null;
  try {
    return await backupNow();
  } catch (err) {
    console.error('[smb] Échec backup automatique :', err.message);
    return null;
  }
}

module.exports = {
  DAYS,
  getConfig,
  isConfigured,
  testConnection,
  listBackups,
  deleteBackup,
  backupNow,
  restoreFromSmb,
  shouldRunNow,
  maybeRunAutoBackup
};
