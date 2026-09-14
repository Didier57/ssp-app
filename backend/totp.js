const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (let i = 0; i < clean.length; i++) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(clean[i]);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hmacSha1(key, message) {
  return crypto.createHmac('sha1', key).update(message).digest();
}

function dynamicTruncation(hmac) {
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return bin % 1000000;
}

function generateCode(secret, counter) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  return dynamicTruncation(hmacSha1(key, buf)).toString().padStart(6, '0');
}

// Génère un secret base32 aléatoire (compatible Google Authenticator, Bitwarden, Duo, etc.)
function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

// URL otpauth:// à encoder en QR code
function getOtpAuthUrl({ username, secret, issuer = 'SSP Openscape' }) {
  const label = encodeURIComponent(`${issuer}:${username}`);
  return (
    `otpauth://totp/${label}` +
    `?secret=${secret}` +
    `&issuer=${encodeURIComponent(issuer)}` +
    `&algorithm=SHA1&digits=6&period=30`
  );
}

// Vérifie un code à 6 chiffres (tolérance ±1 fenêtre de 30 s pour l'horloge)
function verifyTotp(secret, token, { window = 1 } = {}) {
  if (!secret || !token) return false;
  const code = String(token).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    if (generateCode(secret, counter + i) === code) return true;
  }
  return false;
}

module.exports = { generateSecret, getOtpAuthUrl, verifyTotp };
