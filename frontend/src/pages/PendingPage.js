import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

// Shown to someone who signed up with the family code but hasn't been approved yet.
function PendingPage() {
  const { user, refresh, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');

  const check = async () => {
    setChecking(true); setNote('');
    try {
      const u = await refresh();
      if (u && u.status !== 'approved') setNote('Not approved yet. Ask the head of the family to open Family and approve you.');
    } catch (e) { setNote("Couldn't check right now. Try again in a moment."); }
    finally { setChecking(false); }
  };

  // Check quietly every 30 seconds so the page opens up as soon as you're approved.
  useEffect(() => {
    const t = setInterval(() => { refresh().catch(() => {}); }, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="login-container">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <h1>Waiting for approval</h1>
        <p className="subtitle">
          Hi {user?.username}. Your request to join the family has been sent.
          You'll see the family's data once the head of the family approves it.
        </p>
        {note && <div className="login-error">{note}</div>}
        <button className="btn btn-primary" onClick={check} disabled={checking} style={{ width: '100%' }}>
          {checking ? 'Checking…' : 'Check again'}
        </button>
        <button className="btn-logout" onClick={logout} style={{ marginTop: '1rem' }}>Log out</button>
      </div>
    </div>
  );
}

export default PendingPage;
