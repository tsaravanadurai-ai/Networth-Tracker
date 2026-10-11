import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import GoldPricePage from './GoldPricePage';
import FamilyPage from './FamilyPage';
import PasswordPage from './PasswordPage';
import './household.css';

// Settings groups the pages you don't need every day: gold prices, family access and your password.
function SettingsPage() {
  const { section = 'gold' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isHead = user?.role === 'head';
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    if (!isHead) return;
    api.get('/family').then(r => setWaiting(r.data.members.filter(m => m.status === 'pending').length)).catch(() => {});
  }, [isHead, section]);

  const sections = [
    ['gold', 'Gold Prices'],
    ...(isHead ? [['family', 'Family']] : []),
    ['password', 'Password'],
  ];
  if (!sections.some(([id]) => id === section)) return <Navigate to="/settings/gold" replace />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="hh-tabs" role="tablist" style={{ gridTemplateColumns: `repeat(${sections.length}, 1fr)`, maxWidth: 640, width: '100%', margin: '0 auto', position: 'static' }}>
        {sections.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={section === id} className={section === id ? 'on' : ''} onClick={() => navigate('/settings/' + id)}>
            {label}{id === 'family' && waiting > 0 ? <span className="hh-count">{waiting}</span> : null}
          </button>
        ))}
      </div>
      {section === 'gold' && <GoldPricePage />}
      {section === 'family' && <FamilyPage />}
      {section === 'password' && <PasswordPage />}
    </div>
  );
}

export default SettingsPage;
