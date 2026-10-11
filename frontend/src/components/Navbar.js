import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth, can } from '../context/AuthContext';
import api from '../utils/api';

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
);

// Every page in the menu, in order. `tab` is the permission it needs (null = everyone).
const PAGES = [
  { tab: 'home', path: '/home', label: 'Home', icon: ['M3 11l9-8 9 8', 'M5 10v10h5v-6h4v6h5V10'] },
  { tab: 'dashboard', path: '/', label: 'Dashboard', icon: ['M4 13h6V4H4z', 'M14 20h6v-9h-6z', 'M4 20h6v-3H4z', 'M14 7h6V4h-6z'] },
  { tab: 'entries', path: '/entry', label: 'Monthly Entry', short: 'Entry', icon: ['M12 5v14', 'M5 12h14'] },
  { tab: 'reports', path: '/reports', label: 'Reports', icon: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'] },
  { tab: 'shares', path: '/shares', label: 'Shares', icon: ['M3 17l6-6 4 4 8-8', 'M15 7h6v6'] },
  { tab: 'extras', path: '/extras', label: 'Gold/Bank/Debt', icon: ['M3 10l9-6 9 6', 'M5 10v8', 'M19 10v8', 'M9 10v8', 'M15 10v8', 'M3 20h18'] },
  { tab: null, path: '/settings', label: 'Settings', icon: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'] },
];
const MORE_ICON = ['M4 6h16', 'M4 12h16', 'M4 18h16'];

function Navbar() {
  const { logout, user } = useAuth();
  const [waiting, setWaiting] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const [version, setVersion] = useState('');

  useEffect(() => {
    api.get('/version').then(res => setVersion(res.data.version)).catch(() => {});
  }, []);

  // Let the head of the family see when someone is waiting for approval.
  useEffect(() => {
    if (user?.role !== 'head') return;
    api.get('/family').then(res => setWaiting(res.data.members.filter(m => m.status === 'pending').length)).catch(() => {});
  }, [user, location.pathname]);

  useEffect(() => { setMoreOpen(false); }, [location.pathname]);

  const activeFor = (path) => (path === '/' ? location.pathname === '/' || location.pathname.startsWith('/member') : location.pathname.startsWith(path));
  const isActive = (path) => (activeFor(path) ? 'nav-link active' : 'nav-link');
  const pages = PAGES.filter(p => p.tab === null || can(user, p.tab));
  const current = pages.find(p => activeFor(p.path));

  // Phone: the first four pages sit in the bottom bar, the rest go under "More".
  const bar = pages.filter(p => p.path !== '/settings').slice(0, 4);
  const more = pages.filter(p => !bar.includes(p));
  const moreActive = more.some(p => activeFor(p.path));
  const badge = waiting > 0 ? <span className="hh-count" style={{ marginLeft: '0.35rem' }}>{waiting}</span> : null;

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to={can(user, 'dashboard') ? '/' : '/home'} className="navbar-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <span className="brand-full">Family Net Worth</span>
            {version && <span className="brand-version">v{version}</span>}
          </Link>
          <span className="mobile-title">{current ? current.label : ''}</span>
          <ul className="navbar-nav">
            {pages.map(p => (
              <li key={p.path}><Link to={p.path} className={isActive(p.path)}>{p.label}{p.path === '/settings' && badge}</Link></li>
            ))}
            <li><button className="btn-logout" onClick={logout}>Logout</button></li>
          </ul>
        </div>
      </nav>

      {/* Phone bottom bar */}
      <nav className="tabbar" aria-label="Main">
        {bar.map(p => (
          <Link key={p.path} to={p.path} className={'tabbar-item' + (activeFor(p.path) ? ' on' : '')}>
            <Icon d={p.icon} />
            <span>{p.short || p.label.split('/')[0]}</span>
          </Link>
        ))}
        <button type="button" className={'tabbar-item' + (moreActive || moreOpen ? ' on' : '')} onClick={() => setMoreOpen(o => !o)} aria-expanded={moreOpen}>
          <Icon d={MORE_ICON} />
          <span>More{waiting > 0 && <span className="tabbar-dot" aria-label={`${waiting} waiting`} />}</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="more-sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" role="menu" onClick={e => e.stopPropagation()}>
            {more.map(p => (
              <Link key={p.path} to={p.path} className={'more-item' + (activeFor(p.path) ? ' on' : '')} role="menuitem">
                <Icon d={p.icon} /><span>{p.label}</span>{p.path === '/settings' && badge}
              </Link>
            ))}
            <button type="button" className="more-item more-logout" onClick={logout} role="menuitem">
              <Icon d={['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9']} /><span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default Navbar;
