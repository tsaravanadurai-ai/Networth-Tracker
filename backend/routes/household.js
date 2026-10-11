const express = require('express');
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Each list the Home page keeps, with the fields a client may write.
const KINDS = {
  expenses: { table: 'hh_expenses', fields: ['amount', 'what', 'category', 'date'], order: 'date DESC, id DESC' },
  groceries: { table: 'hh_groceries', fields: ['item', 'done'], order: 'done ASC, id DESC' },
  todos: { table: 'hh_todos', fields: ['text', 'assignee', 'due', 'repeat', 'anchor_day', 'done'], order: 'done ASC, id DESC' },
  notes: { table: 'hh_notes', fields: ['title', 'body', 'date', 'repeat', 'anchor_day'], order: 'id DESC' },
};

async function initHouseholdTables() {
  await getDb().executeMultiple(`
    CREATE TABLE IF NOT EXISTS hh_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      what TEXT NOT NULL,
      category TEXT DEFAULT 'Other',
      date TEXT NOT NULL,
      added_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS hh_groceries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item TEXT NOT NULL,
      done INTEGER DEFAULT 0,
      added_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS hh_todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      assignee TEXT DEFAULT 'both',
      due TEXT DEFAULT '',
      repeat TEXT DEFAULT '',
      anchor_day INTEGER DEFAULT 0,
      done INTEGER DEFAULT 0,
      added_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS hh_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      date TEXT DEFAULT '',
      repeat TEXT DEFAULT '',
      anchor_day INTEGER DEFAULT 0,
      added_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function pick(kind, body) {
  const out = {};
  for (const f of KINDS[kind].fields) {
    if (body[f] === undefined) continue;
    let v = body[f];
    if (f === 'done') v = v ? 1 : 0;
    else if (f === 'amount') v = Number(v);
    else if (f === 'anchor_day') v = parseInt(v, 10) || 0;
    else if (f === 'repeat') v = ['weekly', 'monthly', 'bimonthly', 'yearly'].includes(v) ? v : '';
    else v = String(v).slice(0, 2000);
    out[f] = v;
  }
  return out;
}

function kindOf(req, res) {
  const k = KINDS[req.params.kind];
  if (!k) { res.status(404).json({ error: 'Unknown list' }); return null; }
  return k;
}

// People who can be assigned to-dos: everyone with a login.
router.get('/people', async (req, res) => {
  try {
    const r = await getDb().execute('SELECT username FROM users ORDER BY id');
    res.json({ me: req.user.username, people: r.rows.map(x => x.username) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:kind', async (req, res) => {
  const k = kindOf(req, res); if (!k) return;
  try {
    const r = await getDb().execute(`SELECT * FROM ${k.table} ORDER BY ${k.order} LIMIT 2000`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:kind', async (req, res) => {
  const k = kindOf(req, res); if (!k) return;
  try {
    const data = pick(req.params.kind, req.body || {});
    if (req.params.kind === 'expenses' && !(data.amount > 0)) return res.status(400).json({ error: 'Enter an amount greater than zero' });
    const required = { expenses: 'what', groceries: 'item', todos: 'text', notes: 'title' }[req.params.kind];
    if (!data[required] || !String(data[required]).trim()) return res.status(400).json({ error: 'Please fill in ' + required });
    data.added_by = req.user.username;
    const cols = Object.keys(data);
    const r = await getDb().execute({
      sql: `INSERT INTO ${k.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      args: cols.map(c => data[c]),
    });
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:kind/:id', async (req, res) => {
  const k = kindOf(req, res); if (!k) return;
  try {
    const data = pick(req.params.kind, req.body || {});
    const cols = Object.keys(data);
    if (!cols.length) return res.status(400).json({ error: 'Nothing to update' });
    await getDb().execute({
      sql: `UPDATE ${k.table} SET ${cols.map(c => c + ' = ?').join(', ')} WHERE id = ?`,
      args: [...cols.map(c => data[c]), req.params.id],
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:kind/:id', async (req, res) => {
  const k = kindOf(req, res); if (!k) return;
  try {
    if (req.params.kind === 'groceries' && req.params.id === 'bought') {
      await getDb().execute('DELETE FROM hh_groceries WHERE done = 1');
    } else {
      await getDb().execute({ sql: `DELETE FROM ${k.table} WHERE id = ?`, args: [req.params.id] });
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.initHouseholdTables = initHouseholdTables;
