const express = require('express');
const { getDb, newFamilyCode } = require('../db');
const { authenticateToken, requireHead, clearUserCache } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);
router.use(requireHead);

// The family code and everyone who has an account or is asking for one.
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const code = (await db.execute("SELECT value FROM settings WHERE key = 'family_code'")).rows[0]?.value || '';
    const members = (await db.execute(
      "SELECT id, username, role, status, created_at FROM users ORDER BY (status = 'pending') DESC, (role = 'head') DESC, id ASC"
    )).rows.map(r => ({ ...r, id: Number(r.id), isMe: Number(r.id) === req.user.id }));
    res.json({ code, members });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/code', async (req, res) => {
  try {
    const code = newFamilyCode();
    await getDb().execute({ sql: "UPDATE settings SET value = ? WHERE key = 'family_code'", args: [code] });
    res.json({ code });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/members/:id/approve', async (req, res) => {
  try {
    await getDb().execute({ sql: "UPDATE users SET status = 'approved' WHERE id = ? AND role != 'head'", args: [req.params.id] });
    clearUserCache(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Decline a request, or remove someone who already has access. Their saved entries stay.
router.delete('/members/:id', async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: "You can't remove yourself." });
    await getDb().execute({ sql: "DELETE FROM users WHERE id = ? AND role != 'head'", args: [req.params.id] });
    clearUserCache(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Family members whose net worth is tracked (not logins) ----------

const MEMBER_TABLES = ['monthly_entries', 'gold_savings', 'bank_reserves', 'debt_given', 'share_holdings', 'dividends'];
const isColor = c => /^#[0-9a-fA-F]{6}$/.test(c || '');

async function recordCount(db, id) {
  let total = 0;
  for (const t of MEMBER_TABLES) {
    const r = await db.execute({ sql: `SELECT COUNT(*) AS n FROM ${t} WHERE family_member_id = ?`, args: [id] });
    total += Number(r.rows[0].n);
  }
  return total;
}

router.get('/profiles', async (req, res) => {
  try {
    const db = getDb();
    const rows = (await db.execute('SELECT * FROM family_members ORDER BY id')).rows;
    const out = [];
    for (const m of rows) out.push({ ...m, id: Number(m.id), records: await recordCount(db, m.id) });
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/profiles', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 60);
    const label = String(req.body.label || '').trim().slice(0, 60);
    const color = isColor(req.body.color) ? req.body.color : '#4F46E5';
    if (!name || !label) return res.status(400).json({ error: 'Enter a name and a relationship.' });
    const r = await getDb().execute({ sql: 'INSERT INTO family_members (name, label, color) VALUES (?, ?, ?)', args: [name, label, color] });
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/profiles/:id', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 60);
    const label = String(req.body.label || '').trim().slice(0, 60);
    if (!name || !label) return res.status(400).json({ error: 'Enter a name and a relationship.' });
    if (req.body.color !== undefined && !isColor(req.body.color)) return res.status(400).json({ error: 'Pick a colour.' });
    await getDb().execute({
      sql: 'UPDATE family_members SET name = ?, label = ?, color = COALESCE(?, color) WHERE id = ?',
      args: [name, label, req.body.color || null, req.params.id],
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Only members with no saved records can be removed, so no net worth data is lost.
router.delete('/profiles/:id', async (req, res) => {
  try {
    const db = getDb();
    const n = await recordCount(db, req.params.id);
    if (n > 0) return res.status(409).json({ error: `This member has ${n} saved record${n === 1 ? '' : 's'}. Delete those first, or keep the member.` });
    await db.execute({ sql: 'DELETE FROM family_members WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
