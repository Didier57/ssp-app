import React, { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, FileBarChart2, Table, UserCog, Settings, UserCircle, LogOut, DatabaseBackup, Moon, Sun, BadgeCheck } from 'lucide-react';
import { useAuth } from '../App.jsx';
import ProfileModal from './ProfileModal.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [profileOpen, setProfileOpen] = useState(false);

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar-brand">
          <span role="img" aria-label="logo">✆</span> SSP Openscape
        </div>
        <nav className="topbar-nav">
          <NavLink to="/" end>
            <LayoutDashboard size={16} /> Dashboard
          </NavLink>
          <NavLink to="/clients">
            <Users size={16} /> Clients
          </NavLink>
          <NavLink to="/report">
            <FileBarChart2 size={16} /> Report
          </NavLink>
          <NavLink to="/tcd">
            <Table size={16} /> TCD
          </NavLink>
          <NavLink to="/freelicenses">
            <BadgeCheck size={16} /> Free Licences
          </NavLink>
          {isAdmin && (
            <NavLink to="/users">
              <UserCog size={16} /> Utilisateurs
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/settings">
              <Settings size={16} /> Paramètres
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/backup">
              <DatabaseBackup size={16} /> Sauvegarde
            </NavLink>
          )}
        </nav>
        <div className="topbar-user">
          <span className="topbar-role">{user?.role === 'admin' ? 'Administrateur' : 'Lecteur'}</span>
          <span className="topbar-name">{user?.username}</span>
          <button className="btn btn-xs" onClick={toggleTheme} title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}>
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button className="btn btn-xs" onClick={() => setProfileOpen(true)} title="Mon profil">
            <UserCircle size={13} /> Profil
          </button>
          <button className="btn btn-xs" onClick={logout} title="Déconnexion">
            <LogOut size={13} /> Quitter
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  );
}