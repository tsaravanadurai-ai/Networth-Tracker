const express = require('express');
const { getDb, newFamilyCode } = require('../db');
const { authenticateToken, requireHead, clearUserCache } = require('../middleware/auth');

const router = express.Router();

function safeList(text) {
  try { const a = JSON.parse(text); return Array.isArray(a) ? a.map(Number).filter(Number.isInteger) : []; } catch (e) { return []; }
}
router.use(authenticateToken);
router.use(requireHead);

// The family code and everyone who has an account or is asking for one.
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const code = (await db.execute("SELECT value FROM settings WHERE key = 'family_code'")).rows[0]?.value || '';
    const members = (await db.execute(
      "SELECT id, username, role, status, member_id, access, created_at FROM users ORDER BY (status = 'pending') DESC, (role = 'head') DESC, id ASC"
    )).rows.map(r => ({
      id: Number(r.id), username: r.username, role: r.role, status: r.status, created_at: r.created_at,
      memberId: r.member_id == null ? null : Number(r.member_id),
      // null = sees every member; [] or [ids] = only those
      access: r.role === 'head' || r.access == null ? null : safeList(r.access),
      isMe: Number(r.id) === req.user.id,
    }));
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
    // A newly approved login sees no one's net worth until you choose members for it.
    await getDb().execute({
      sql: "UPDATE users SET status = 'approved', access = CASE WHEN status = 'pending' THEN '[]' ELSE access END WHERE id = ? AND role != 'head'",
      args: [req.params.id],
    });
    clearUserCache(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Link a login to a family member, and choose whose net worth it can see.
router.patch('/members/:id', async (req, res) => {
  try {
    const db = getDb();
    const u = (await db.execute({ sql: 'SELECT id, role FROM users WHERE id = ?', args: [req.params.id] })).rows[0];
    if (!u) return res.status(404).json({ error: 'That login no longer exists.' });
    const known = new Set((await db.execute('SELECT id FROM family_members')).rows.map(r => Number(r.id)));
    const sets = [], args = [];
    if ('memberId' in req.body) {
      const m = req.body.memberId == null || req.body.memberId === '' ? null : Number(req.body.memberId);
      if (m !== null && !known.has(m)) return res.status(400).json({ error: 'Pick a family member from the list.' });
      sets.push('member_id = ?'); args.push(m);
    }
    if ('access' in req.body && u.role !== 'head') {
      const a = req.body.access;
      if (a === null) { sets.push('access = NULL'); }
      else if (Array.isArray(a)) { sets.push('access = ?'); args.push(JSON.stringify([...new Set(a.map(Number))].filter(x => known.has(x)))); }
      else return res.status(400).json({ error: 'Choose who they can see.' });
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to change.' });
    await db.execute({ sql: `UPDATE users SET ${sets.join(', ')} WHERE id = ?`, args: [...args, req.params.id] });
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
