const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const upload = multer({ dest: path.join(__dirname, '../uploads/'), limits: { fileSize: 5 * 1024 * 1024 } });
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMonthName(month) { return MONTH_NAMES[month - 1] || ''; }

function parseGoldMonth(monthStr) {
  if (!monthStr) return null;
  if (typeof monthStr === 'number') {
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + monthStr * 86400000);
    if (!isNaN(d.getTime())) return { month: d.getMonth() + 1, year: d.getFullYear() };
    return null;
  }
  const str = monthStr.toString().trim();
  const m1 = str.match(/^(\w+)\s*[-–]\s*(\d{4})$/);
  if (m1) { const idx = MONTH_NAMES.findIndex(m => m.toLowerCase() === m1[1].substring(0,3).toLowerCase()); if (idx >= 0) return { month: idx+1, year: parseInt(m1[2]) }; }
  const m2 = str.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m2) return { month: parseInt(m2[1]), year: parseInt(m2[2]) };
  const m3 = str.match(/^(\w+)\s+(\d{4})$/);
  if (m3) { const idx = MONTH_NAMES.findIndex(m => m.toLowerCase() === m3[1].substring(0,3).toLowerCase()); if (idx >= 0) return { month: idx+1, year: parseInt(m3[2]) }; }
  const m4 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m4) { let y = parseInt(m4[3]); if (y < 100) y = y < 50 ? 2000+y : 1900+y; return { month: parseInt(m4[1]), year: y }; }
  return null;
}

router.get('/price/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const db = getDb();
    const result = await db.execute({ sql: 'SELECT * FROM gold_prices WHERE year = ? AND month = ?', args: [year, month] });
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      const latest = await db.execute('SELECT * FROM gold_prices ORDER BY year DESC, month DESC LIMIT 1');
      res.json({ price_per_gram: latest.rows[0]?.price_per_gram || 0, estimated: true, month: parseInt(month), year: parseInt(year) });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/prices', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute('SELECT * FROM gold_prices ORDER BY year DESC, month DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/price', async (req, res) => {
  try {
    const { month, year, price_per_gram } = req.body;
    if (!month || !year || !price_per_gram) return res.status(400).json({ error: 'Month, year, and price_per_gram are required' });
    const db = getDb();
    // Try insert, on conflict update
    try {
      await db.execute({ sql: 'INSERT INTO gold_prices (month, year, price_per_gram) VALUES (?, ?, ?)', args: [month, year, price_per_gram] });
    } catch (e) {
      await db.execute({ sql: 'UPDATE gold_prices SET price_per_gram = ?, updated_at = CURRENT_TIMESTAMP WHERE month = ? AND year = ?', args: [price_per_gram, month, year] });
    }
    res.json({ message: 'Gold price updated', month, year, price_per_gram });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/prices/bulk', async (req, res) => {
  try {
    const { prices } = req.body;
    if (!prices || !Array.isArray(prices)) return res.status(400).json({ error: 'Prices array is required' });
    const db = getDb();
    for (const p of prices) {
      try {
        await db.execute({ sql: 'INSERT INTO gold_prices (month, year, price_per_gram) VALUES (?, ?, ?)', args: [p.month, p.year, p.price_per_gram] });
      } catch (e) {
        await db.execute({ sql: 'UPDATE gold_prices SET price_per_gram = ?, updated_at = CURRENT_TIMESTAMP WHERE month = ? AND year = ?', args: [p.price_per_gram, p.month, p.year] });
      }
    }
    res.json({ message: `${prices.length} gold prices updated` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/calculate/:year/:month/:grams', async (req, res) => {
  try {
    const { year, month, grams } = req.params;
    const db = getDb();
    let priceMonth = parseInt(month) - 1, priceYear = parseInt(year);
    if (priceMonth === 0) { priceMonth = 12; priceYear -= 1; }

    let price = await db.execute({ sql: 'SELECT * FROM gold_prices WHERE year = ? AND month = ?', args: [priceYear, priceMonth] });
    if (price.rows.length === 0) price = await db.execute({ sql: 'SELECT * FROM gold_prices WHERE year = ? AND month = ?', args: [year, month] });
    if (price.rows.length === 0) price = await db.execute('SELECT * FROM gold_prices ORDER BY year DESC, month DESC LIMIT 1');

    if (price.rows.length === 0) {
      return res.json({ value: 0, price_per_gram: 0, grams: parseFloat(grams), message: 'No gold price available.' });
    }

    const p = price.rows[0];
    const value = parseFloat(grams) * p.price_per_gram;
    res.json({ value, price_per_gram: p.price_per_gram, grams: parseFloat(grams), price_month: p.month, price_year: p.year,
      message: `Calculated at ₹${p.price_per_gram}/gram (${getMonthName(p.month)} ${p.year} rate)` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const wb = XLSX.readFile(req.file.path, { raw: false });
    const rawWb = XLSX.readFile(req.file.path, { raw: true });
    const db = getDb();
    let imported = 0;
    const errors = [];

    for (const sheetName of wb.SheetNames) {
      const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { raw: false });
      const rawData = XLSX.utils.sheet_to_json(rawWb.Sheets[sheetName], { raw: true });

      for (let idx = 0; idx < data.length; idx++) {
        const row = data[idx];
        const columns = Object.keys(row);
        const monthCol = columns.find(c => c.toLowerCase() === 'month') || columns[0];
        const priceCol = columns.find(c => c.toLowerCase().includes('price') || c.toLowerCase().includes('rate') || c.toLowerCase().includes('gram') || c.toLowerCase().includes('gold')) || columns[1];
        if (!monthCol || !priceCol) continue;

        const monthStr = row[monthCol];
        const rawMonthStr = rawData[idx] ? rawData[idx][monthCol] : monthStr;
        let parsed = parseGoldMonth(monthStr);
        if (!parsed) parsed = parseGoldMonth(rawMonthStr);
        if (!parsed) { if (monthStr) errors.push(`Row ${idx+2}: Could not parse month "${monthStr}"`); continue; }

        const rawRow = rawData[idx] || row;
        let price = parseFloat(rawRow[priceCol]);
        if (isNaN(price) || price <= 0) { const cleaned = (rawRow[priceCol]||'').toString().replace(/[₹,\s]/g, ''); price = parseFloat(cleaned); }
        if (isNaN(price) || price <= 0) { errors.push(`Row ${idx+2}: Invalid price "${row[priceCol]}"`); continue; }

        try {
          await db.execute({ sql: 'INSERT INTO gold_prices (month, year, price_per_gram) VALUES (?, ?, ?)', args: [parsed.month, parsed.year, price] });
        } catch (e) {
          await db.execute({ sql: 'UPDATE gold_prices SET price_per_gram = ?, updated_at = CURRENT_TIMESTAMP WHERE month = ? AND year = ?', args: [price, parsed.month, parsed.year] });
        }
        imported++;
      }
    }

    fs.unlinkSync(req.file.path);
    res.json({ message: `Successfully imported ${imported} gold prices`, imported, errors });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Error processing file: ' + err.message });
  }
});

router.get('/template', async (req, res) => {
  try {
    const db = getDb();
    const existing = await db.execute('SELECT * FROM gold_prices ORDER BY year ASC, month ASC');
    const wb = XLSX.utils.book_new();
    let rows;
    if (existing.rows.length > 0) {
      rows = existing.rows.map(p => ({ 'Month': `${MONTH_NAMES[p.month-1]} - ${p.year}`, 'Price per Gram (₹)': p.price_per_gram }));
    } else {
      rows = [];
      for (let y = 2021; y <= 2026; y++) for (let m = 1; m <= 12; m++) rows.push({ 'Month': `${MONTH_NAMES[m-1]} - ${y}`, 'Price per Gram (₹)': 0 });
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Gold Prices');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Gold_Prices_Template.xlsx"');
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
