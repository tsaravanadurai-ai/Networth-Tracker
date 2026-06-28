import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Navbar() {
  const { logout } = useAuth();
  const location = useLocation();

  const isActive = (path) => location.pathname === path ? 'nav-link active' : 'nav-link';

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          Family Net Worth
        </Link>
        <ul className="navbar-nav">
          <li><Link to="/" className={isActive('/')}>Dashboard</Link></li>
          <li><Link to="/entry" className={isActive('/entry')}>Monthly Entry</Link></li>
          <li><Link to="/reports" className={isActive('/reports')}>Reports</Link></li>
          <li><Link to="/extras" className={isActive('/extras')}>Gold/Bank/Debt</Link></li>
          <li><Link to="/gold-prices" className={isActive('/gold-prices')}>Gold Prices</Link></li>
          <li><button className="btn-logout" onClick={logout}>Logout</button></li>
        </ul>
      </div>
    </nav>
  );
}

export default Navbar;
