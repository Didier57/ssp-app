const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { sign, signPending, requireAuth } = require('../auth');
const { JWT_SECRET } = require('../config');
const { sendLoginNotification, sendPasswordEmailWithToken, smtpConfigured } = require('../mailer');
const { createResetToken, consumeResetToken } = require('../reset-token');
const { logAudit } = require('../audit');
const { generateSecret, getOtpAuthUrl, verifyTotp } = require('../totp');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Identifiants manquants' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    logAudit({ username: String(username || '').trim() || null, action: 'Échec de connexion', category: 'login' });
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  if (user.active !== 1) {
    logAudit({ username: user.username, action: 'Tentative de connexion (compte désactivé)', category: 'login' });
    return res.status(401).json({ error: 'Compte désactivé — contactez un administrateur' });
  }
  // Double authentification : on demande le code avant d'émettre le JWT définitif
  if (user.totp_enabled === 1) {
    logAudit({ user, action: 'Connexion — code 2FA demandé', category: 'login', target: user.username });
    return res.json({ totpRequired: true, pendingToken: signPending(user) });
  }
  // Notification de connexion aux admins (si activée) — non bloquant
  sendLoginNotification(user.username, user.role);
  db.prepare("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?").run(user.id);
  logAudit({ user, action: 'Connexion', category: 'login', target: user.username });
  res.json({ token: sign(user), user: { id: user.id, username: user.username, role: user.role, email: user.email } });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, role, email FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  res.json(user);
});

// Étape 2 de la connexion : validation du code à deux facteurs
router.post('/login/verify', (req, res) => {
  const { pendingToken, code } = req.body || {};
  if (!pendingToken || !code) return res.status(400).json({ error: 'Code requis' });
  let payload;
  try {
    payload = jwt.verify(pendingToken, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expirée — reconnectez-vous' });
  }
  if (!payload.totpPending) return res.status(400).json({ error: 'Jeton invalide' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
  if (!user || user.active !== 1) return res.status(401).json({ error: 'Compte désactivé' });
  if (user.totp_enabled !== 1 || !user.totp_secret) {
    return res.status(400).json({ error: 'Double authentification non activée' });
  }
  if (!verifyTotp(user.totp_secret, String(code))) {
    logAudit({ user, action: 'Échec de la vérification 2FA', category: 'login', target: user.username });
    return res.status(401).json({ error: 'Code invalide' });
  }
  sendLoginNotification(user.username, user.role);
  db.prepare("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?").run(user.id);
  logAudit({ user, action: 'Connexion (2FA validé)', category: 'login', target: user.username });
  res.json({ token: sign(user), user: { id: user.id, username: user.username, role: user.role, email: user.email } });
});

// === Double authentification (auto-gestion) ===

// Statut actuel
router.get('/2fa/status', requireAuth, (req, res) => {
  const u = db.prepare('SELECT totp_enabled FROM users WHERE id = ?').get(req.user.id);
  res.json({ enabled: !!(u && u.totp_enabled === 1) });
});

// Démarrer l'activation : génère un secret (non encore activé tant que non confirmé)
router.post('/2fa/setup', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  if (user.totp_enabled === 1) {
    return res.status(400).json({ error: 'La double authentification est déjà active' });
  }
  const secret = generateSecret();
  db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, user.id);
  res.json({ secret, otpauthUrl: getOtpAuthUrl({ username: user.username, secret }), issuer: 'SSP Openscape' });
});

// Confirmer l'activation en fournissant un code valide
router.post('/2fa/enable', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  if (!user.totp_secret) return res.status(400).json({ error: 'Initialisation requise' });
  const code = String((req.body || {}).code || '').trim();
  if (!verifyTotp(user.totp_secret, code)) return res.status(400).json({ error: 'Code invalide' });
  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(user.id);
  logAudit({ user, action: 'Activation de la double authentification', category: 'profile', target: user.username });
  res.json({ ok: true });
});

// Désactiver (nécessite le mot de passe actuel pour prouver son identité)
router.post('/2fa/disable', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  const { currentPassword } = req.body || {};
  if (!currentPassword || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  }
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(user.id);
  logAudit({ user, action: 'Désactivation de la double authentification', category: 'profile', target: user.username });
  res.json({ ok: true });
});

// L'utilisateur modifie ses propres informations (username, email, mot de passe)
router.put('/profile', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });

  const { username, email, currentPassword, newPassword } = req.body || {};

  // Vérifier le mot de passe actuel si on veut en changer un
  if (newPassword) {
    if (!currentPassword || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères' });
    }
  }

  let newUsername = user.username;
  let newEmail = user.email;

  if (username !== undefined) {
    const v = String(username).trim();
    if (!v) return res.status(400).json({ error: "Le nom d'utilisateur ne peut pas être vide" });
    if (v !== user.username) {
      const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(v, user.id);
      if (exists) return res.status(400).json({ error: "Ce nom d'utilisateur est déjà pris" });
    }
    newUsername = v;
  }

  if (email !== undefined) {
    const v = String(email).trim();
    if (v && !EMAIL_RE.test(v)) return res.status(400).json({ error: 'Adresse email invalide' });
    newEmail = v || null;
  }

  if (newUsername !== user.username || newEmail !== user.email || newPassword) {
    db.prepare('UPDATE users SET username = ?, email = ? WHERE id = ?').run(newUsername, newEmail, user.id);
    if (newPassword) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), user.id);
    }
  }

  const changes = [];
  if (newUsername !== user.username) changes.push('nom d\'utilisateur');
  if (newEmail !== user.email) changes.push('email');
  if (newPassword) changes.push('mot de passe');
  logAudit({ user: req.user, action: 'Modification du profil', category: 'profile', target: newUsername, detail: changes.join(', ') || null });

  res.json({ id: user.id, username: newUsername, role: user.role, email: newEmail });
});

// Mot de passe oublié : envoie un lien de réinitialisation si l'email existe
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  const v = String(email || '').trim().toLowerCase();
  if (!v || !EMAIL_RE.test(v)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }
  if (!smtpConfigured()) {
    return res.status(400).json({ error: 'L\'envoi d\'emails n\'est pas configuré — contactez un administrateur' });
  }

  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(v);
  if (!user) {
    // Réponse volontairement neutre pour ne pas révéler l'existence du compte
    return res.json({ ok: true });
  }

  try {
    const token = createResetToken(user.id);
    await sendPasswordEmailWithToken({
      to: user.email,
      token,
      subject: 'SSP Openscape — réinitialisation de votre mot de passe',
      intro: `Bonjour ${user.username}, une réinitialisation de votre mot de passe a été demandée.`,
      note: 'Ce lien expire dans 72 heures. Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet email.'
    });
    logAudit({ user, action: 'Demande de réinitialisation de mot de passe', category: 'profile', target: user.username });
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] Échec envoi email de reset:', err.message);
    res.status(500).json({ error: 'Impossible d\'envoyer l\'email — réessayez plus tard' });
  }
});

// Définit le nouveau mot de passe depuis le lien reçu par email
router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Lien invalide' });
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
  }

  const reset = consumeResetToken(String(token));
  if (!reset) return res.status(400).json({ error: 'Lien invalide ou expiré — demandez un nouvel email' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(reset.userId);
  if (!user) return res.status(400).json({ error: 'Utilisateur introuvable' });

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), user.id);
  logAudit({ user, action: 'Réinitialisation du mot de passe', category: 'profile', target: user.username });
  res.json({ ok: true });
});

module.exports = router;