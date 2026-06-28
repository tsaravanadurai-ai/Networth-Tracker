const express = require('express');
const multer = require('multer');
const path = require('path');
const fs_module = require('fs');
const XLSX = require('xlsx');
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const upload = multer({ dest: path.join(__dirname, '../uploads/'), limits: { fileSize: 5 * 1024 * 1024 } });
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseMonth(str) {
  if (!str) return null;
  if (typeof str === 'number') { const epoch = new Date(1899,11,30); const d = new Date(epoch.getTime()+str*86400000); if (!isNaN(d.getTime())) return {month:d.getMonth()+1, year:d.getFullYear()}; return null; }
  const s = str.toString().trim();
  const m1 = s.match(/^(\w+)\s*[-–]\s*(\d{4})$/); if (m1) { const idx = MONTH_NAMES.findIndex(m=>m.toLowerCase()===m1[1].substring(0,3).toLowerCase()); if (idx>=0) return {month:idx+1,year:parseInt(m1[2])}; }
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (m2) { let y=parseInt(m2[3]); if(y<100) y+=2000; return {month:parseInt(m2[1]),year:y}; }
  const d = new Date(s); if (!isNaN(d.getTime()) && d.getFullYear()>2000) return {month:d.getMonth()+1, year:d.getFullYear()};
  return null;
}

// ==================== GOLD SAVINGS ====================

router.get('/gold-savings', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute(`SELECT gs.*, fm.name as member_name, fm.color as member_color FROM gold_savings gs JOIN family_members fm ON gs.family_member_id = fm.id ORDER BY gs.purchase_year DESC, gs.purchase_month DESC`);
    const latestPrice = await db.execute('SELECT price_per_gram FROM gold_prices ORDER BY year DESC, month DESC LIMIT 1');
    const currentPricePerGram = latestPrice.rows[0]?.price_per_gram || 0;

    const entries = result.rows;
    const enriched = entries.map(e => ({ ...e, current_value: e.grams * currentPricePerGram, current_price_per_gram: currentPricePerGram, gain: (e.grams * currentPricePerGram) - e.purchase_amount }));
    const totalGrams = entries.reduce((s,e) => s+e.grams, 0);
    const totalPurchaseAmount = entries.reduce((s,e) => s+e.purchase_amount, 0);
    const totalCurrentValue = totalGrams * currentPricePerGram;

    res.json({ entries: enriched, summary: { totalGrams, totalPurchaseAmount, totalCurrentValue, totalGain: totalCurrentValue - totalPurchaseAmount, currentPricePerGram } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/gold-savings/:memberId', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute({ sql: 'SELECT * FROM gold_savings WHERE family_member_id = ? ORDER BY purchase_year DESC, purchase_month DESC', args: [req.params.memberId] });
    const latestPrice = await db.execute('SELECT price_per_gram FROM gold_prices ORDER BY year DESC, month DESC LIMIT 1');
    const currentPricePerGram = latestPrice.rows[0]?.price_per_gram || 0;
    const enriched = result.rows.map(e => ({ ...e, current_value: e.grams * currentPricePerGram, current_price_per_gram: currentPricePerGram, gain: (e.grams * currentPricePerGram) - e.purchase_amount }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/gold-savings', async (req, res) => {
  try {
    const { family_member_id, description, grams, purchase_month, purchase_year, notes } = req.body;
    if (!family_member_id || !grams || !purchase_month || !purchase_year) return res.status(400).json({ error: 'Member, grams, month, and year are required' });
    const db = getDb();
    let price = await db.execute({ sql: 'SELECT price_per_gram FROM gold_prices WHERE year = ? AND month = ?', args: [purchase_year, purchase_month] });
    if (price.rows.length === 0) price = await db.execute({ sql: 'SELECT price_per_gram FROM gold_prices ORDER BY ABS(year - ?) + ABS(month - ?) LIMIT 1', args: [purchase_year, purchase_month] });
    const pricePerGram = price.rows[0]?.price_per_gram || 0;
    const purchaseAmount = parseFloat(grams) * pricePerGram;
    const result = await db.execute({
      sql: 'INSERT INTO gold_savings (family_member_id, description, grams, purchase_month, purchase_year, purchase_price_per_gram, purchase_amount, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [family_member_id, description || 'Gold', parseFloat(grams), purchase_month, purchase_year, pricePerGram, purchaseAmount, notes || '']
    });
    res.json({ id: Number(result.lastInsertRowid), purchase_price_per_gram: pricePerGram, purchase_amount: purchaseAmount,
      message: pricePerGram > 0 ? `Added ${grams}g gold. Purchase value: ₹${purchaseAmount.toLocaleString('en-IN')} (at ₹${pricePerGram}/g)` : `Added ${grams}g gold. Set gold price to calculate purchase amount.` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/gold-savings/:id', async (req, res) => {
  try { const db = getDb(); await db.execute({ sql: 'DELETE FROM gold_savings WHERE id = ?', args: [req.params.id] }); res.json({ message: 'Gold entry deleted' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/gold-savings-export', async (req, res) => {
  try {
    const db = getDb();
    const members = (await db.execute('SELECT * FROM family_members')).rows;
    const latestPrice = await db.execute('SELECT price_per_gram FROM gold_prices ORDER BY year DESC, month DESC LIMIT 1');
    const currentPricePerGram = latestPrice.rows[0]?.price_per_gram || 0;
    const wb = XLSX.utils.book_new();

    for (const member of members) {
      const entries = (await db.execute({ sql: 'SELECT * FROM gold_savings WHERE family_member_id = ? ORDER BY purchase_year, purchase_month', args: [member.id] })).rows;
      if (entries.length === 0) continue;
      const rows = entries.map(e => ({ 'Description': e.description, 'Grams': e.grams, 'Purchase Month': `${MONTH_NAMES[e.purchase_month-1]} - ${e.purchase_year}`, 'Purchase Rate (₹/g)': e.purchase_price_per_gram, 'Purchase Amount (₹)': e.purchase_amount, 'Current Rate (₹/g)': currentPricePerGram, 'Current Value (₹)': e.grams * currentPricePerGram, 'Gain/Loss (₹)': (e.grams * currentPricePerGram) - e.purchase_amount, 'Notes': e.notes }));
      const totalGrams = entries.reduce((s,e) => s+e.grams, 0);
      const totalPurchase = entries.reduce((s,e) => s+e.purchase_amount, 0);
      const totalCurrent = totalGrams * currentPricePerGram;
      rows.push({ 'Description': 'TOTAL', 'Grams': totalGrams, 'Purchase Month': '', 'Purchase Rate (₹/g)': '', 'Purchase Amount (₹)': totalPurchase, 'Current Rate (₹/g)': currentPricePerGram, 'Current Value (₹)': totalCurrent, 'Gain/Loss (₹)': totalCurrent - totalPurchase, 'Notes': '' });
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, member.name);
    }
    if (wb.SheetNames.length === 0) return res.status(404).json({ error: 'No gold savings data' });
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Gold_Savings_Report.xlsx"');
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== BANK RESERVES ====================

router.get('/bank-reserves', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute('SELECT br.*, fm.name as member_name, fm.color as member_color FROM bank_reserves br JOIN family_members fm ON br.family_member_id = fm.id ORDER BY br.amount DESC');
    const total = result.rows.reduce((s,e) => s+e.amount, 0);
    res.json({ entries: result.rows, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bank-reserves', async (req, res) => {
  try {
    const { family_member_id, bank_name, account_type, amount, notes } = req.body;
    if (!family_member_id || !bank_name || !amount) return res.status(400).json({ error: 'Member, bank name, and amount are required' });
    const db = getDb();
    const result = await db.execute({ sql: 'INSERT INTO bank_reserves (family_member_id, bank_name, account_type, amount, notes) VALUES (?, ?, ?, ?, ?)', args: [family_member_id, bank_name, account_type || 'Savings', parseFloat(amount), notes || ''] });
    res.json({ id: Number(result.lastInsertRowid), message: 'Bank reserve added' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/bank-reserves/:id', async (req, res) => {
  try {
    const { family_member_id, bank_name, account_type, amount, notes } = req.body;
    const db = getDb();
    await db.execute({ sql: 'UPDATE bank_reserves SET family_member_id = ?, bank_name = ?, account_type = ?, amount = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', args: [family_member_id, bank_name, account_type || 'Savings', parseFloat(amount), notes || '', req.params.id] });
    res.json({ message: 'Bank reserve updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/bank-reserves/:id', async (req, res) => {
  try { const db = getDb(); await db.execute({ sql: 'DELETE FROM bank_reserves WHERE id = ?', args: [req.params.id] }); res.json({ message: 'Bank reserve deleted' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== DEBT GIVEN ====================

router.get('/debt-given', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute('SELECT dg.*, fm.name as member_name, fm.color as member_color FROM debt_given dg JOIN family_members fm ON dg.family_member_id = fm.id ORDER BY dg.status ASC, dg.given_date DESC');
    const totalPending = result.rows.filter(e => e.status === 'pending').reduce((s,e) => s+e.amount, 0);
    const totalReturned = result.rows.filter(e => e.status === 'returned').reduce((s,e) => s+e.amount, 0);
    res.json({ entries: result.rows, totalPending, totalReturned });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/debt-given', async (req, res) => {
  try {
    const { family_member_id, person_name, amount, given_date, expected_return_date, purpose, notes } = req.body;
    if (!family_member_id || !person_name || !amount || !given_date) return res.status(400).json({ error: 'Member, person name, amount, and date are required' });
    const db = getDb();
    const result = await db.execute({ sql: 'INSERT INTO debt_given (family_member_id, person_name, amount, given_date, expected_return_date, purpose, notes) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [family_member_id, person_name, parseFloat(amount), given_date, expected_return_date || '', purpose || '', notes || ''] });
    res.json({ id: Number(result.lastInsertRowid), message: 'Debt entry added' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/debt-given/:id', async (req, res) => {
  try {
    const { family_member_id, person_name, amount, given_date, expected_return_date, purpose, status, notes } = req.body;
    const db = getDb();
    await db.execute({ sql: 'UPDATE debt_given SET family_member_id = ?, person_name = ?, amount = ?, given_date = ?, expected_return_date = ?, purpose = ?, status = ?, notes = ? WHERE id = ?', args: [family_member_id, person_name, parseFloat(amount), given_date, expected_return_date || '', purpose || '', status || 'pending', notes || '', req.params.id] });
    res.json({ message: 'Debt entry updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/debt-given/:id/status', async (req, res) => {
  try {
    const db = getDb();
    await db.execute({ sql: 'UPDATE debt_given SET status = ? WHERE id = ?', args: [req.body.status, req.params.id] });
    res.json({ message: `Status updated to ${req.body.status}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/debt-given/:id', async (req, res) => {
  try { const db = getDb(); await db.execute({ sql: 'DELETE FROM debt_given WHERE id = ?', args: [req.params.id] }); res.json({ message: 'Debt entry deleted' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== GOLD SAVINGS IMPORT ====================

router.post('/gold-savings-import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const wb = XLSX.readFile(req.file.path, { raw: true });
    const db = getDb();
    const members = (await db.execute('SELECT * FROM family_members')).rows;
    const memberMap = {}; members.forEach(m => { memberMap[m.name.toLowerCase()] = m.id; });
    const results = { imported: 0, errors: [] };

    for (const sheetName of wb.SheetNames) {
      if (sheetName.toLowerCase() === 'instructions') continue;
      const memberId = memberMap[sheetName.toLowerCase()];
      if (!memberId) { results.errors.push(`Sheet "${sheetName}" doesn't match a family member. Skipped.`); continue; }
      const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { raw: true });

      for (let idx = 0; idx < data.length; idx++) {
        const row = data[idx];
        const description = row['Description'] || row['description'] || row['Item'] || 'Gold';
        const grams = parseFloat(row['Grams'] || row['grams'] || row['Weight'] || 0);
        const monthStr = row['Purchase Month'] || row['Month'] || '';
        const notes = row['Notes'] || row['notes'] || '';
        if (!grams || grams <= 0) continue;

        let purchaseMonth, purchaseYear;
        if (monthStr) { const parsed = parseMonth(monthStr); if (parsed) { purchaseMonth = parsed.month; purchaseYear = parsed.year; } else { results.errors.push(`Row ${idx+2} in "${sheetName}": Could not parse month "${monthStr}"`); continue; } }
        else { purchaseMonth = new Date().getMonth()+1; purchaseYear = new Date().getFullYear(); }

        let price = await db.execute({ sql: 'SELECT price_per_gram FROM gold_prices WHERE year = ? AND month = ?', args: [purchaseYear, purchaseMonth] });
        if (price.rows.length === 0) price = await db.execute({ sql: 'SELECT price_per_gram FROM gold_prices ORDER BY ABS(year - ?) + ABS(month - ?) LIMIT 1', args: [purchaseYear, purchaseMonth] });
        const pricePerGram = price.rows[0]?.price_per_gram || 0;
        const purchaseAmount = grams * pricePerGram;

        await db.execute({
          sql: 'INSERT INTO gold_savings (family_member_id, description, grams, purchase_month, purchase_year, purchase_price_per_gram, purchase_amount, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          args: [memberId, description, grams, purchaseMonth, purchaseYear, pricePerGram, purchaseAmount, notes]
        });
        results.imported++;
      }
    }
    fs_module.unlinkSync(req.file.path);
    res.json({ message: `Imported ${results.imported} gold entries`, imported: results.imported, errors: results.errors });
  } catch (err) {
    if (req.file && fs_module.existsSync(req.file.path)) fs_module.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});

router.get('/gold-savings-template', async (req, res) => {
  try {
    const db = getDb();
    const members = (await db.execute('SELECT * FROM family_members')).rows;
    const wb = XLSX.utils.book_new();
    for (const member of members) {
      const existing = (await db.execute({ sql: 'SELECT * FROM gold_savings WHERE family_member_id = ? ORDER BY purchase_year, purchase_month', args: [member.id] })).rows;
      let rows;
      if (existing.length > 0) { rows = existing.map(e => ({ 'Description': e.description, 'Grams': e.grams, 'Purchase Month': `${MONTH_NAMES[e.purchase_month-1]} - ${e.purchase_year}`, 'Notes': e.notes })); }
      else { rows = [{ 'Description': 'Gold Chain', 'Grams': 20, 'Purchase Month': 'Jan - 2023', 'Notes': '' }, { 'Description': 'Gold Coin', 'Grams': 8, 'Purchase Month': 'May - 2024', 'Notes': '' }]; }
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws, member.name);
    }
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Gold_Savings_Template.xlsx"');
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
