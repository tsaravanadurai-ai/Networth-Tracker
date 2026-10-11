import React, { useState } from 'react';
import api from '../utils/api';

function PasswordPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    if (next.length < 8) return setMsg({ ok: false, text: 'Use at least 8 characters for the new password.' });
    if (next !== confirm) return setMsg({ ok: false, text: "The two new passwords don't match." });
    setBusy(true);
    try {
      // Sent without the global 401 redirect so a wrong current password shows a message instead of logging you out.
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next }, { validateStatus: s => s < 500 })
        .then(r => { if (r.status >= 400) throw new Error(r.data?.error || 'Could not change password'); });
      setMsg({ ok: true, text: 'Password changed. Use the new one next time you log in.' });
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      setMsg({ ok: false, text: err.message === 'Current password is incorrect' ? 'Your current password is wrong. Try again.' : err.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="card-header"><h2 className="card-title">Change password</h2></div>
      <form onSubmit={submit} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div className="form-group">
          <label className="form-label" htmlFor="pw-current">Current password</label>
          <input id="pw-current" className="form-control" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} required />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="pw-new">New password</label>
          <input id="pw-new" className="form-control" type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} required />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="pw-confirm">New password again</label>
          <input id="pw-confirm" className="form-control" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
        </div>
        {msg && <p style={{ color: msg.ok ? 'var(--success)' : 'var(--danger)', fontSize: '0.9rem' }}>{msg.text}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
      </form>
    </div>
  );
}

export default PasswordPage;
