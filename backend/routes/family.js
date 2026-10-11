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

module.exports = router;
