import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { X, ShieldCheck, ShieldOff } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function ProfileModal({ onClose }) {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    username: user?.username || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');

  const [twofaEnabled, setTwofaEnabled] = useState(false);
  const [twofaSetup, setTwofaSetup] = useState(null);
  const [twofaCode, setTwofaCode] = useState('');
  const [twofaPassword, setTwofaPassword] = useState('');
  const [twofaBusy, setTwofaBusy] = useState(false);
  const [twofaError, setTwofaError] = useState('');
  const [twofaMsg, setTwofaMsg] = useState('');

  useEffect(() => {
    api.get('/auth/2fa/status').then((r) => setTwofaEnabled(!!r.enabled)).catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setDone('');
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      setError('La confirmation du nouveau mot de passe ne correspond pas.');
      return;
    }
    setSaving(true);
    try {
      const body = { username: form.username.trim(), email: form.email.trim() || null };
      if (form.newPassword) {
        body.currentPassword = form.currentPassword;
        body.newPassword = form.newPassword;
      }
      const updated = await api.put('/auth/profile', body);
      updateUser({ ...user, username: updated.username, email: updated.email });
      setForm((f) => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }));
      setDone('Profil mis à jour.');
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function startSetup() {
    setTwofaError('');
    setTwofaMsg('');
    setTwofaBusy(true);
    try {
      const r = await api.post('/auth/2fa/setup');
      setTwofaSetup(r);
    } catch (e) {
      setTwofaError(e.message);
    } finally {
      setTwofaBusy(false);
    }
  }

  async function confirmSetup() {
    setTwofaError('');
    setTwofaMsg('');
    setTwofaBusy(true);
    try {
      await api.post('/auth/2fa/enable', { code: twofaCode });
      setTwofaEnabled(true);
      setTwofaSetup(null);
      setTwofaCode('');
      setTwofaMsg('Double authentification activée.');
    } catch (e) {
      setTwofaError(e.message);
    } finally {
      setTwofaBusy(false);
    }
  }

  async function disableTwofa() {
    setTwofaError('');
    setTwofaMsg('');
    setTwofaBusy(true);
    try {
      await api.post('/auth/2fa/disable', { currentPassword: twofaPassword });
      setTwofaEnabled(false);
      setTwofaPassword('');
      setTwofaMsg('Double authentification désactivée.');
    } catch (e) {
      setTwofaError(e.message);
    } finally {
      setTwofaBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Mon profil</h3>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner full">{error}</div>}
            <div className="field">
              <label>Nom d'utilisateur</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="nom@entreprise.com"
              />
            </div>
            <div className="field">
              <label>Mot de passe actuel <span className="field-hint">(pour changer le mot de passe)</span></label>
              <input
                type="password"
                value={form.currentPassword}
                onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                autoComplete="current-password"
              />
            </div>
            <div className="field">
              <label>Nouveau mot de passe <span className="field-hint">(6 caractères min.)</span></label>
              <input
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label>Confirmer le nouveau mot de passe</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                autoComplete="new-password"
              />
            </div>
            {done && <div className="success-banner full">{done}</div>}

            <div className="twofa-section full">
              <div className="twofa-heading">
                <ShieldCheck size={16} />
                <b>Double authentification (2FA)</b>
                {twofaEnabled
                  ? <span className="badge badge-green">Activée</span>
                  : <span className="badge badge-gray">Désactivée</span>}
              </div>
              <p className="field-hint" style={{ marginTop: 4 }}>
                Compatible avec toute application d'authentification (Bitwarden, Google Authenticator,
                Microsoft Authenticator, Duo Mobile…). Elle est facultative.
              </p>

              {twofaError && <div className="error-banner full" style={{ marginTop: 8 }}>{twofaError}</div>}
              {twofaMsg && <div className="success-banner full" style={{ marginTop: 8 }}>{twofaMsg}</div>}

              {twofaEnabled ? (
                <div style={{ marginTop: 12 }}>
                  <div className="field">
                    <label>Mot de passe actuel <span className="field-hint">(pour désactiver)</span></label>
                    <input
                      type="password"
                      value={twofaPassword}
                      onChange={(e) => setTwofaPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <button type="button" className="btn btn-danger" style={{ marginTop: 8 }} onClick={disableTwofa} disabled={twofaBusy || !twofaPassword}>
                    {twofaBusy ? <span className="spinner" /> : <><ShieldOff size={14} /> Désactiver le 2FA</>}
                  </button>
                </div>
              ) : twofaSetup ? (
                <div style={{ marginTop: 12 }}>
                  <div className="twofa-setup">
                    <div className="qr-box">
                      <QRCodeSVG value={twofaSetup.otpauthUrl} size={160} />
                    </div>
                    <div className="twofa-setup-info">
                      <p className="field-hint">1. Scannez ce QR code avec votre application d'authentification.</p>
                      <p className="field-hint">2. Sinon, saisissez manuellement cette clé :</p>
                      <div className="temp-pass-box" style={{ fontSize: 12 }}>{twofaSetup.secret}</div>
                      <div className="field" style={{ marginTop: 12 }}>
                        <label>Code de vérification</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={twofaCode}
                          onChange={(e) => setTwofaCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="000000"
                          style={{ letterSpacing: 4 }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="twofa-actions" style={{ marginTop: 12 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => { setTwofaSetup(null); setTwofaCode(''); }}>Annuler</button>
                    <button type="button" className="btn btn-primary" onClick={confirmSetup} disabled={twofaBusy || twofaCode.length !== 6}>
                      {twofaBusy ? <span className="spinner" /> : 'Activer'}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={startSetup} disabled={twofaBusy}>
                  {twofaBusy ? <span className="spinner" /> : <><ShieldCheck size={14} /> Activer la double authentification</>}
                </button>
              )}
            </div>
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
