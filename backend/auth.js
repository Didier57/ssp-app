const jwt = require('jsonwebtoken');
const db = require('./db');
const { JWT_SECRET, JWT_EXPIRES } = require('./config');

function sign(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// Jeton temporaire (5 min) émis après vérification du mot de passe,
// le temps de saisir le code à deux facteurs.
function signPending(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, totpPending: true },
    JWT_SECRET,
    { expiresIn: '5m' }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (req.user.totpPending) {
      return res.status(401).json({ error: 'Vérification à deux facteurs requise' });
    }
    const u = db.prepare('SELECT active FROM users WHERE id = ?').get(req.user.id);
    if (!u || u.active !== 1) {
      return res.status(401).json({ error: 'Compte désactivé' });
    }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

module.exports = { sign, signPending, requireAuth, requireAdmin };
