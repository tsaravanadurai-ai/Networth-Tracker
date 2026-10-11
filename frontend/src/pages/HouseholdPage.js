import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';
import { formatCurrency } from '../utils/helpers';
import './household.css';

// ---------- dates & repeats ----------
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => iso(new Date());
const parse = s => new Date(s + 'T00:00:00');
const dayOf = s => parse(s).getDate();
const fmtDate = s => (s ? parse(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

const REPEATS = [
  ['', "Doesn't repeat"],
  ['weekly', 'Every week'],
  ['monthly', 'Every month'],
  ['bimonthly', 'Every 2 months'],
  ['yearly', 'Every year'],
];
const REPEAT_LABEL = { weekly: 'every week', monthly: 'every month', bimonthly: 'every 2 months', yearly: 'every year' };

function step(s, rep, anchor) {
  const d = parse(s);
  if (rep === 'weekly') { d.setDate(d.getDate() + 7); return iso(d); }
  const n = { monthly: 1, bimonthly: 2, yearly: 12 }[rep];
  if (!n) return s;
  const day = anchor || d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, last));
  return iso(t);
}
function onOrAfter(s, rep, anchor, min) {
  let x = s;
  for (let i = 0; x < min && i < 1000; i++) x = step(x, rep, anchor);
  return x;
}

const CATEGORIES = ['Groceries', 'Bills', 'Rent', 'Eating out', 'Travel', 'Fuel', 'Shopping', 'Health', 'School', 'Other'];

// ---------- voice ----------
const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

function MicButton({ lang, onText }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  if (!Recognition) return null;

  const start = () => {
    if (listening) { recRef.current && recRef.current.stop(); return; }
    const rec = new Recognition();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = e => {
      const text = Array.from(e.results).map(r => r[0].transcript).join(' ').trim();
      if (text) onText(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch (err) { setListening(false); }
  };

  return (
    <button type="button" className={'hh-mic' + (listening ? ' on' : '')} onClick={start}
      aria-label={listening ? 'Stop listening' : 'Speak'} title={listening ? 'Listening… tap to stop' : 'Speak'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </button>
  );
}

const append = (prev, text) => (prev ? prev.trim() + ' ' + text : text);

// ---------- small pieces ----------
function DeleteButton({ onDelete }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 2500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={'hh-del' + (armed ? ' armed' : '')}
      onClick={() => (armed ? onDelete() : setArmed(true))} aria-label="Delete">
      {armed ? 'Delete?' : '×'}
    </button>
  );
}

function Check({ done, onClick, label }) {
  return (
    <button type="button" className={'hh-check' + (done ? ' done' : '')} onClick={onClick} aria-label={label}>
      {done ? '✓' : ''}
    </button>
  );
}

const nameOf = (u, me) => (u === 'both' ? 'Both' : u === me ? 'You' : u ? u.charAt(0).toUpperCase() + u.slice(1) : '');

// ---------- page ----------
function HouseholdPage() {
  const [tab, setTab] = useState('shopping');
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('hh-lang') || 'ta-IN'; } catch (e) { return 'ta-IN'; } });
  const [data, setData] = useState({ expenses: [], groceries: [], todos: [], notes: [] });
  const [people, setPeople] = useState({ me: '', people: [] });
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { try { localStorage.setItem('hh-lang', lang); } catch (e) { /* ignore */ } }, [lang]);

  const load = useCallback(async () => {
    try {
      const [e, g, t, n] = await Promise.all(['expenses', 'groceries', 'todos', 'notes'].map(k => api.get('/household/' + k)));
      setData({ expenses: e.data, groceries: g.data, todos: t.data, notes: n.data });
      setError('');
    } catch (err) {
      setError("Couldn't load your lists. Check your connection and pull to refresh.");
    } finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    load();
    api.get('/household/people').then(r => setPeople(r.data)).catch(() => {});
    // Pick up your partner's changes: refresh when the app comes back to the front, and every 20 s while open.
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 20000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(t); };
  }, [load]);

  const run = async fn => {
    try { await fn(); await load(); }
    catch (err) { setError(err.response?.data?.error || "Couldn't save. Check your connection and try again."); }
  };
  const add = (kind, body) => run(() => api.post('/household/' + kind, body));
  const patch = (kind, id, body) => run(() => api.patch(`/household/${kind}/${id}`, body));
  const del = (kind, id) => run(() => api.delete(`/household/${kind}/${id}`));

  const me = people.me;
  const left = arr => arr.filter(x => !x.done).length;

  return (
    <div className="hh">
      <div className="hh-head">
        <div>
          <p className="hh-eyebrow">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="hh-title">Home</h1>
        </div>
        <div className="hh-lang" role="group" aria-label="Voice language">
          <button type="button" className={lang === 'ta-IN' ? 'on' : ''} onClick={() => setLang('ta-IN')}>தமிழ்</button>
          <button type="button" className={lang === 'en-IN' ? 'on' : ''} onClick={() => setLang('en-IN')}>English</button>
        </div>
      </div>

      <div className="hh-tabs" role="tablist">
        {[['shopping', 'Shopping', left(data.groceries)], ['money', 'Money', null], ['todos', 'To-dos', left(data.todos)], ['notes', 'Notes', null]].map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}{n ? <span className="hh-count">{n}</span> : null}
          </button>
        ))}
      </div>

      {error && <p className="hh-error">{error}</p>}
      {!Recognition && <p className="hh-hint">This browser has no voice input. Use the mic on your phone's keyboard instead.</p>}

      {tab === 'money' && <Money rows={data.expenses} me={me} lang={lang} add={add} del={del} loaded={loaded} />}
      {tab === 'shopping' && <Shopping rows={data.groceries} me={me} lang={lang} add={add} patch={patch} del={del} loaded={loaded} />}
      {tab === 'todos' && <Todos rows={data.todos} me={me} people={people.people} lang={lang} add={add} patch={patch} del={del} loaded={loaded} />}
      {tab === 'notes' && <Notes rows={data.notes} me={me} lang={lang} add={add} del={del} loaded={loaded} />}
    </div>
  );
}

// ---------- Money ----------
function Money({ rows, me, lang, add, del, loaded }) {
  const now = new Date();
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [amount, setAmount] = useState('');
  const [what, setWhat] = useState('');
  const [category, setCategory] = useState('Groceries');
  const [date, setDate] = useState(todayISO());

  const y = month.getFullYear(), m = month.getMonth();
  const inMonth = rows.filter(r => { const d = parse(r.date); return d.getFullYear() === y && d.getMonth() === m; });
  const total = inMonth.reduce((s, r) => s + (r.amount || 0), 0);
  const byPerson = {}; inMonth.forEach(r => { byPerson[r.added_by] = (byPerson[r.added_by] || 0) + r.amount; });
  const byCat = {}; inMonth.forEach(r => { byCat[r.category] = (byCat[r.category] || 0) + r.amount; });
  const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 4);

  // "500 petrol" or "petrol 500 rupees" → amount + description
  const onVoice = text => {
    const num = text.replace(/,/g, '').match(/\d+(\.\d+)?/);
    if (num && !amount) {
      setAmount(num[0]);
      const rest = text.replace(num[0], '').replace(/\b(rupees?|rs\.?)\b|ரூபாய்|ரூ\.?/gi, '').replace(/\s+/g, ' ').trim();
      if (rest) setWhat(w => append(w, rest));
    } else setWhat(w => append(w, text));
  };

  const submit = async e => {
    e.preventDefault();
    const amt = parseFloat(String(amount).replace(/[^0-9.]/g, ''));
    if (!(amt > 0) || !what.trim()) return;
    await add('expenses', { amount: amt, what: what.trim(), category, date: date || todayISO() });
    setAmount(''); setWhat('');
  };

  return (
    <section className="hh-section">
      <div className="hh-summary">
        <div className="hh-monthnav">
          <button type="button" onClick={() => setMonth(new Date(y, m - 1, 1))} aria-label="Previous month">‹</button>
          <span>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
          <button type="button" onClick={() => setMonth(new Date(y, m + 1, 1))} aria-label="Next month">›</button>
        </div>
        <div className="hh-big">{formatCurrency(total)}</div>
        <div className="hh-chips">
          {Object.entries(byPerson).map(([u, v]) => <span key={u} className="hh-chip">{nameOf(u, me)} paid {formatCurrency(v)}</span>)}
        </div>
        {topCats.length > 0 && (
          <div className="hh-bars">
            {topCats.map(([c, v]) => (
              <div key={c} className="hh-bar">
                <span>{c}</span>
                <div className="hh-track"><div style={{ width: `${(v / topCats[0][1]) * 100}%` }} /></div>
                <span className="hh-num">{formatCurrency(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <form className="hh-form" onSubmit={submit} autoComplete="off">
        <input id="hh-amt" className="form-control" inputMode="decimal" placeholder="Amount ₹" value={amount} onChange={e => setAmount(e.target.value)} required />
        <div className="hh-withmic">
          <input id="hh-what" className="form-control" placeholder="What for, e.g. 500 petrol" value={what} onChange={e => setWhat(e.target.value)} required />
          <MicButton lang={lang} onText={onVoice} />
        </div>
        <select id="hh-cat" className="form-control" value={category} onChange={e => setCategory(e.target.value)}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <input id="hh-date" className="form-control" type="date" value={date} onChange={e => setDate(e.target.value)} />
        <button className="btn btn-primary" type="submit">Add expense</button>
      </form>
      <p className="hh-hint">Tap the mic and say the amount and what it was for, like "500 petrol".</p>

      <ul className="hh-list">
        {loaded && !inMonth.length && <li className="hh-empty">No expenses this month yet. Add the first one above.</li>}
        {inMonth.map(r => (
          <li key={r.id}>
            <div className="hh-main"><span className="hh-t">{r.what}</span><span className="hh-s">{fmtDate(r.date)} · {r.category} · {nameOf(r.added_by, me)}</span></div>
            <span className="hh-num">{formatCurrency(r.amount)}</span>
            <DeleteButton onDelete={() => del('expenses', r.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Shopping ----------
function Shopping({ rows, me, lang, add, patch, del, loaded }) {
  const [item, setItem] = useState('');
  const sorted = [...rows].sort((a, b) => a.done - b.done || b.id - a.id);

  const submit = async e => {
    e.preventDefault();
    const items = item.split(/[,،\n]+|\s+(?:and|மற்றும்)\s+/i).map(s => s.trim().replace(/[.।]+$/, '')).filter(Boolean);
    for (const it of items) await add('groceries', { item: it, done: false });
    setItem('');
  };

  return (
    <section className="hh-section">
      <form className="hh-form" onSubmit={submit} autoComplete="off">
        <div className="hh-withmic wide">
          <input id="hh-item" className="form-control" placeholder="Item, e.g. துவரம் பருப்பு 1 kg" value={item} onChange={e => setItem(e.target.value)} required />
          <MicButton lang={lang} onText={t => setItem(p => (p ? p.trim() + ', ' + t : t))} />
        </div>
        <button className="btn btn-primary" type="submit">Add</button>
      </form>
      <p className="hh-hint">Say several items at once with "and" or "மற்றும்" between them. Each becomes its own line.</p>
      <ul className="hh-list">
        {loaded && !rows.length && <li className="hh-empty">The list is empty. Add what you need to buy.</li>}
        {sorted.map(r => (
          <li key={r.id} className={r.done ? 'done' : ''}>
            <Check done={!!r.done} onClick={() => patch('groceries', r.id, { done: !r.done })} label={r.done ? 'Mark not bought' : 'Mark bought'} />
            <div className="hh-main"><span className="hh-t">{r.item}</span><span className="hh-s">Added by {nameOf(r.added_by, me)}</span></div>
            <DeleteButton onDelete={() => del('groceries', r.id)} />
          </li>
        ))}
      </ul>
      {rows.some(r => r.done) && <button type="button" className="btn btn-secondary" onClick={() => del('groceries', 'bought')}>Clear bought items</button>}
    </section>
  );
}

// ---------- To-dos ----------
function Todos({ rows, me, people, lang, add, patch, del, loaded }) {
  const [text, setText] = useState('');
  const [assignee, setAssignee] = useState('both');
  const [due, setDue] = useState('');
  const [repeat, setRepeat] = useState('');
  const today = todayISO();
  const sorted = [...rows].sort((a, b) => a.done - b.done || (a.due || '9999').localeCompare(b.due || '9999') || b.id - a.id);

  const submit = async e => {
    e.preventDefault();
    if (!text.trim()) return;
    const d = due || (repeat ? today : '');
    await add('todos', { text: text.trim(), assignee, due: d, repeat, anchor_day: d ? dayOf(d) : 0, done: false });
    setText(''); setDue(''); setRepeat('');
  };

  const tick = r => {
    if (r.repeat && !r.done) patch('todos', r.id, { due: onOrAfter(step(r.due || today, r.repeat, r.anchor_day), r.repeat, r.anchor_day, today) });
    else patch('todos', r.id, { done: !r.done });
  };

  return (
    <section className="hh-section">
      <form className="hh-form" onSubmit={submit} autoComplete="off">
        <div className="hh-withmic wide">
          <input id="hh-todo" className="form-control" placeholder="What needs doing" value={text} onChange={e => setText(e.target.value)} required />
          <MicButton lang={lang} onText={t => setText(p => append(p, t))} />
        </div>
        <select id="hh-who" className="form-control" value={assignee} onChange={e => setAssignee(e.target.value)}>
          <option value="both">For both of us</option>
          {people.map(u => <option key={u} value={u}>{u === me ? 'For me' : 'For ' + nameOf(u, me)}</option>)}
        </select>
        <input id="hh-due" className="form-control" type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="Due date" />
        <select id="hh-rep" className="form-control" value={repeat} onChange={e => setRepeat(e.target.value)} aria-label="Repeat">
          {REPEATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn btn-primary" type="submit">Add</button>
      </form>
      <ul className="hh-list">
        {loaded && !rows.length && <li className="hh-empty">Nothing to do. Add a task and choose who it's for.</li>}
        {sorted.map(r => (
          <li key={r.id} className={r.done ? 'done' : ''}>
            <Check done={!!r.done} onClick={() => tick(r)} label={r.done ? 'Mark not done' : 'Mark done'} />
            <div className="hh-main">
              <span className="hh-t">{r.text}</span>
              <span className="hh-s">{nameOf(r.assignee || 'both', me)}{r.repeat ? ' · Repeats ' + REPEAT_LABEL[r.repeat] : ''}</span>
            </div>
            {r.due && <span className={'hh-tag' + (!r.done && r.due < today ? ' late' : '')}>{!r.done && r.due < today ? 'Overdue · ' : ''}{fmtDate(r.due)}</span>}
            <DeleteButton onDelete={() => del('todos', r.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Notes ----------
function Notes({ rows, me, lang, add, del, loaded }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState('');
  const [repeat, setRepeat] = useState('');
  const today = todayISO();

  const view = rows
    .map(r => (r.date && r.repeat ? { ...r, date: onOrAfter(r.date, r.repeat, r.anchor_day, today) } : r))
    .sort((a, b) => {
      const ua = a.date && a.date >= today, ub = b.date && b.date >= today;
      if (ua !== ub) return ua ? -1 : 1;
      if (ua && ub) return a.date.localeCompare(b.date);
      return b.id - a.id;
    });

  const submit = async e => {
    e.preventDefault();
    if (!title.trim()) return;
    const d = date || (repeat ? today : '');
    await add('notes', { title: title.trim(), body: body.trim(), date: d, repeat, anchor_day: d ? dayOf(d) : 0 });
    setTitle(''); setBody(''); setDate(''); setRepeat('');
  };

  return (
    <section className="hh-section">
      <form className="hh-form" onSubmit={submit} autoComplete="off">
        <div className="hh-withmic wide">
          <input id="hh-ntitle" className="form-control" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} required />
          <MicButton lang={lang} onText={t => setTitle(p => append(p, t))} />
        </div>
        <div className="hh-withmic wide">
          <textarea id="hh-nbody" className="form-control" placeholder="Details (optional)" value={body} onChange={e => setBody(e.target.value)} />
          <MicButton lang={lang} onText={t => setBody(p => append(p, t))} />
        </div>
        <input id="hh-ndate" className="form-control" type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Reminder date" />
        <select id="hh-nrep" className="form-control" value={repeat} onChange={e => setRepeat(e.target.value)} aria-label="Repeat">
          {REPEATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn btn-primary" type="submit">Save note</button>
      </form>
      <ul className="hh-list">
        {loaded && !rows.length && <li className="hh-empty">No notes yet. Add a date to make one a reminder.</li>}
        {view.map(r => (
          <li key={r.id} className="hh-note">
            <div className="hh-noterow">
              <strong className="hh-t">{r.title}</strong>
              {r.date && <span className="hh-tag">{r.date === today ? 'Today' : (r.date < today ? 'Past · ' : '') + fmtDate(r.date)}</span>}
              <DeleteButton onDelete={() => del('notes', r.id)} />
            </div>
            {r.body && <p className="hh-body">{r.body}</p>}
            <span className="hh-s">By {nameOf(r.added_by, me)}{r.repeat ? ' · Repeats ' + REPEAT_LABEL[r.repeat] : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default HouseholdPage;
