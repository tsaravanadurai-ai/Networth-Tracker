const express = require('express');
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const DEBT_CATEGORIES = ['Personal Loan (Debt)', 'Home Loan (Debt)', 'Car Loan (Debt)', 'Other Loan (Debt)'];

function isDebtCategory(category) {
  return DEBT_CATEGORIES.includes(category) || category.toLowerCase().includes('loan') || category.toLowerCase().includes('debt');
}

router.get('/members', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute('SELECT * FROM family_members');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/debt-categories', (req, res) => {
  res.json(DEBT_CATEGORIES);
});

router.get('/:memberId/:year/:month', async (req, res) => {
  try {
    const { memberId, year, month } = req.params;
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM monthly_entries WHERE family_member_id = ? AND year = ? AND month = ? ORDER BY category, description',
      args: [memberId, year, month]
    });
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM monthly_entries WHERE family_member_id = ? ORDER BY year DESC, month DESC, category, description',
      args: [memberId]
    });
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { family_member_id, month, year, category, description, invested_amount, current_value, debt_amount } = req.body;

    if (!family_member_id || !month || !year || !category) {
      return res.status(400).json({ error: 'Member, month, year, and category are required' });
    }

    const db = getDb();
    const desc = description || category;
    let invAmount = 0, curValue = 0;

    if (isDebtCategory(category)) {
      const debtAmt = parseFloat(debt_amount) || parseFloat(current_value) || 0;
      curValue = -Math.abs(debtAmt);
    } else {
      invAmount = parseFloat(invested_amount) || 0;
      curValue = parseFloat(current_value) || 0;
    }

    const result = await db.execute({
      sql: 'INSERT INTO monthly_entries (family_member_id, month, year, category, description, invested_amount, current_value) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [family_member_id, month, year, category, desc, invAmount, curValue]
    });

    res.json({ id: Number(result.lastInsertRowid), message: 'Entry added successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { family_member_id, month, year, category, description, invested_amount, current_value, debt_amount } = req.body;
    const db = getDb();
    const desc = description || category;
    let invAmount = 0, curValue = 0;

    if (isDebtCategory(category)) {
      const debtAmt = parseFloat(debt_amount) || parseFloat(current_value) || 0;
      curValue = -Math.abs(debtAmt);
    } else {
      invAmount = parseFloat(invested_amount) || 0;
      curValue = parseFloat(current_value) || 0;
    }

    await db.execute({
      sql: 'UPDATE monthly_entries SET family_member_id = ?, month = ?, year = ?, category = ?, description = ?, invested_amount = ?, current_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [family_member_id, month, year, category, desc, invAmount, curValue, id]
    });

    res.json({ message: 'Entry updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    await db.execute({ sql: 'DELETE FROM monthly_entries WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'Entry deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk', async (req, res) => {
  try {
    const { entries } = req.body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Entries array is required' });
    }

    const db = getDb();
    const stmts = entries.map(entry => ({
      sql: 'INSERT INTO monthly_entries (family_member_id, month, year, category, description, invested_amount, current_value) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [entry.family_member_id, entry.month, entry.year, entry.category, entry.description || entry.category, entry.invested_amount || 0, entry.current_value || 0]
    }));
    await db.batch(stmts);
    res.json({ message: `${entries.length} entries added successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/copy-month', async (req, res) => {
  try {
    const { fromMonth, fromYear, toMonth, toYear } = req.body;
    if (!fromMonth || !fromYear || !toMonth || !toYear) {
      return res.status(400).json({ error: 'Source and destination month/year are required' });
    }

    const db = getDb();
    const existing = await db.execute({ sql: 'SELECT COUNT(*) as count FROM monthly_entries WHERE month = ? AND year = ?', args: [toMonth, toYear] });
    if (existing.rows[0].count > 0) {
      return res.status(400).json({ error: 'Destination month already has entries.' });
    }

    const source = await db.execute({
      sql: 'SELECT family_member_id, category, description, invested_amount, current_value FROM monthly_entries WHERE month = ? AND year = ?',
      args: [fromMonth, fromYear]
    });
    if (source.rows.length === 0) {
      return res.status(404).json({ error: 'No entries found for the source month' });
    }

    const stmts = source.rows.map(e => ({
      sql: 'INSERT INTO monthly_entries (family_member_id, month, year, category, description, invested_amount, current_value) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [e.family_member_id, toMonth, toYear, e.category, e.description, e.invested_amount, e.current_value]
    }));
    await db.batch(stmts);
    res.json({ message: `${source.rows.length} entries copied successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
