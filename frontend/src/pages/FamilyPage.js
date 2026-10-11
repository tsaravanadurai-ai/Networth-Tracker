import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import './household.css';

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const since = s => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');


const RELATIONS = ['Myself', 'Wife', 'Husband', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Family Account'];
const PALETTE = ['#4F46E5', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#0EA5E9', '#EF4444', '#14B8A6'];

// The people whose net worth is tracked. They don't need a login.
function MembersSection() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ name: '', label: '', color: PALETTE[0] });
  const [adding, setAdding] = useState({ name: '', label: '', color: PALETTE[0] });
  const [armed, setArmed] = useState(null);

  const load = useCallback(async () => {
    try { const r = await api.get('/family/profiles'); setRows(r.data); setError(''); }
    catch (e) { setError(e.response?.data?.error || "Couldn't load family members."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const used = new Set(rows.map(r => r.color.toUpperCase()));
    setAdding(a => (a.name || a.label ? a : { ...a, color: PALETTE.find(c => !used.has(c)) || PALETTE[0] }));
  }, [rows]);

  const act = async fn => {
    try { await fn(); await load(); return true; }
    catch (e) { setError(e.response?.data?.error || "Couldn't save. Try again."); return false; }
  };

  const save = async id => { if (await act(() => api.patch('/family/profiles/' + id, draft))) setEditing(null); };
  const add = async e => {
    e.preventDefault();
    if (await act(() => api.post('/family/profiles', adding))) setAdding({ name: '', label: '', color: PALETTE[0] });
  };
  const remove = m => {
    if (m.records > 0) { setError(`${m.name} has ${m.records} saved record${m.records === 1 ? '' : 's'}, so they can't be removed. You can rename them instead.`); return; }
    if (armed === m.id) { setArmed(null); act(() => api.delete('/family/profiles/' + m.id)); }
    else { setArmed(m.id); setTimeout(() => setArmed(a => (a === m.id ? null : a)), 3000); }
  };

  return (
    <>
      <h2 className="hh-eyebrow" style={{ marginTop: '0.5rem' }}>Family members</h2>
      <p className="hh-hint" style={{ marginTop: '-0.5rem' }}>The people whose net worth you track. They don't need a login.</p>
      {error && <p className="hh-error">{error}</p>}
      <datalist id="fm-relations">{RELATIONS.map(r => <option key={r} value={r} />)}</datalist>
      <ul className="hh-list">
        {rows.map(m => (
          editing === m.id ? (
            <li key={m.id}>
              <form className="hh-form" style={{ flex: 1 }} onSubmit={e => { e.preventDefault(); save(m.id); }}>
                <input id={'fm-name-' + m.id} className="form-control" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Name" required />
                <input id={'fm-label-' + m.id} className="form-control" list="fm-relations" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder="Relationship" required />
                <input id={'fm-color-' + m.id} type="color" className="fm-color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} aria-label="Colour" />
                <button className="btn btn-primary btn-sm" type="submit">Save</button>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => setEditing(null)}>Cancel</button>
              </form>
            </li>
          ) : (
            <li key={m.id}>
              <span className="fm-dot" style={{ background: m.color }} />
              <div className="hh-main">
                <span className="hh-t">{m.name}</span>
                <span className="hh-s">{m.label} · {m.records ? `${m.records} record${m.records === 1 ? '' : 's'}` : 'No records yet'}</span>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditing(m.id); setDraft({ name: m.name, label: m.label, color: m.color }); setError(''); }}>Edit</button>
              <button type="button" className={'hh-del' + (armed === m.id ? ' armed' : '')} onClick={() => remove(m)} aria-label={'Remove ' + m.name}>
                {armed === m.id ? 'Remove?' : '×'}
              </button>
            </li>
          )
        ))}
      </ul>
      <form className="hh-form" onSubmit={add} autoComplete="off">
        <input id="fm-new-name" className="form-control" placeholder="Name" value={adding.name} onChange={e => setAdding({ ...adding, name: e.target.value })} required />
        <input id="fm-new-label" className="form-control" list="fm-relations" placeholder="Relationship, e.g. Mother" value={adding.label} onChange={e => setAdding({ ...adding, label: e.target.value })} required />
        <input id="fm-new-color" type="color" className="fm-color" value={adding.color} onChange={e => setAdding({ ...adding, color: e.target.value })} aria-label="Colour" />
        <button className="btn btn-primary" type="submit">Add member</button>
      </form>
    </>
  );
}

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

      <MembersSection />
    </div>
  );
}

export default FamilyPage;
