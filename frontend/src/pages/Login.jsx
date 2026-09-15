import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { setSession } from '../api.js';
import { useAuth } from '../App.jsx';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const [mode, setMode] = useState('login'); // 'login' | 'forgot' | 'forgotDone'
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const [otpPending, setOtpPending] = useState(''); // token temporaire en attente de code 2FA
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(username, password);
      if (res.totpRequired) {
        setOtpPending(res.pendingToken);
        setOtpCode('');
        return;
      }
      setSession(res.token, res.user);
      login(res.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleOtp(e) {
    e.preventDefault();
    setError('');
    setOtpLoading(true);
    try {
      const res = await api.post('/auth/login/verify', { pendingToken: otpPending, code: otpCode });
      setSession(res.token, res.user);
      login(res.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    setError('');
    setResetLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: resetEmail });
      setMode('forgotDone');
    } catch (err) {
      setError(err.message);
    } finally {
      setResetLoading(false);
    }
  }

  if (otpPending) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={handleOtp}>
          <div className="logo">✆</div>
          <h1>Double authentification</h1>
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Saisissez le code à 6 chiffres affiché dans votre application
            d'authentification (Bitwarden, Authenticator, Duo Mobile…).
          </p>
          {error && <div className="error-banner">{error}</div>}
          <div className="field">
            <label>Code de vérification</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              autoFocus
              style={{ fontSize: 20, letterSpacing: 6, textAlign: 'center' }}
            />
          </div>
          <button className="btn btn-primary btn-block" disabled={otpLoading || otpCode.length !== 6}>
            {otpLoading ? <span className="spinner" /> : 'Valider'}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => { setOtpPending(''); setError(''); }} style={{ marginTop: 8 }}>
            ← Retour à la connexion
          </button>
        </form>
      </div>
    );
  }

  if (mode === 'forgot') {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={handleForgot}>
          <div className="logo">✆</div>
          <h1>Réinitialiser le mot de passe</h1>
          {error && <div className="error-banner">{error}</div>}
          <div className="field">
            <label>Adresse email du compte</label>
            <input
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="nom@entreprise.com"
              autoFocus
            />
          </div>
          <button className="btn btn-primary btn-block" disabled={resetLoading}>
            {resetLoading ? <span className="spinner" /> : 'Envoyer le lien'}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => { setMode('login'); setError(''); }} style={{ marginTop: 8 }}>
            ← Retour à la connexion
          </button>
        </form>
      </div>
    );
  }

  if (mode === 'forgotDone') {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="logo">✆</div>
          <h1>Demande envoyée</h1>
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Si un compte existe avec cette adresse, un email contenant un lien de réinitialisation
            vient de vous être envoyé (valable 24 h). Vérifiez votre boîte de réception.
          </p>
          <button className="btn btn-ghost btn-block" onClick={() => { setMode('login'); setError(''); }} style={{ marginTop: 8 }}>
            ← Retour à la connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="logo">✆</div>
        <h1>SSP Openscape Business</h1>
        <p>Gestion des clients et licences</p>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label>Nom d'utilisateur</label>
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label>Mot de passe</label>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-block" disabled={loading}>
          {loading ? <span className="spinner" /> : 'Se connecter'}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={() => { setMode('forgot'); setError(''); }} style={{ marginTop: 8 }}>
          Mot de passe oublié ?
        </button>
      </form>
    </div>
  );
}