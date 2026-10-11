import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import './household.css';

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const since = s => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function FamilyPage() {
  const [code, setCode] = useState('');
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [armed, setArmed] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/family');
      setCode(r.data.code); setMembers(r.data.members); setError('');
    } catch (e) { setError(e.response?.data?.error || "Couldn't load your family. Try again."); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 20000);
    return () => clearInterval(t);
  }, [load]);

  const act = async fn => { try { await fn(); await load(); } catch (e) { setError(e.response?.data?.error || "Couldn't save. Try again."); } };

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch (e) { /* the code is shown on screen to copy by hand */ }
  };

  const pending = members.filter(m => m.status === 'pending');
  const approved = members.filter(m => m.status === 'approved');

  const removeBtn = (m, label) => (
    <button type="button" className={'hh-del' + (armed === m.id ? ' armed' : '')}
      onClick={() => {
        if (armed === m.id) { setArmed(null); act(() => api.delete('/family/members/' + m.id)); }
        else { setArmed(m.id); setTimeout(() => setArmed(a => (a === m.id ? null : a)), 3000); }
      }}>
      {armed === m.id ? 'Tap again to confirm' : label}
    </button>
  );

  return (
    <div className="hh">
      <div className="hh-head">
        <div>
          <p className="hh-eyebrow">Head of the family</p>
          <h1 className="hh-title">Family</h1>
        </div>
      </div>

      {error && <p className="hh-error">{error}</p>}

      <div className="hh-summary">
        <span className="hh-eyebrow">Family code</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span className="hh-big" style={{ letterSpacing: '0.15em', userSelect: 'all' }}>{code || '········'}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <p className="hh-hint">Give this code to a family member. They enter it when they sign up, and you approve them here.</p>
        {confirmNew ? (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="hh-hint">The old code will stop working for new sign-ups.</span>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => { setConfirmNew(false); act(() => api.post('/family/code')); }}>Make new code</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmNew(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmNew(true)}>Make a new code</button>
        )}
      </div>

      <h2 className="hh-eyebrow" style={{ marginTop: '0.5rem' }}>Requests waiting {pending.length ? `(${pending.length})` : ''}</h2>
      <ul className="hh-list">
        {!pending.length && <li className="hh-empty">No one is waiting. New requests show up here.</li>}
        {pending.map(m => (
          <li key={m.id}>
            <div className="hh-main"><span className="hh-t">{cap(m.username)}</span><span className="hh-s">Asked on {since(m.created_at)}</span></div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => act(() => api.post(`/family/members/${m.id}/approve`))}>Approve</button>
            {removeBtn(m, 'Decline')}
          </li>
        ))}
      </ul>

      <h2 className="hh-eyebrow" style={{ marginTop: '0.5rem' }}>Can see the family's data</h2>
      <ul className="hh-list">
        {approved.map(m => (
          <li key={m.id}>
            <div className="hh-main">
              <span className="hh-t">{cap(m.username)}{m.isMe ? ' (you)' : ''}</span>
              <span className="hh-s">{m.role === 'head' ? 'Head of the family' : 'Member'} · since {since(m.created_at)}</span>
            </div>
            {m.role !== 'head' && removeBtn(m, 'Remove')}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FamilyPage;
