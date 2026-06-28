const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const upload = multer({
  dest: path.join(__dirname, '../uploads/'),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) cb(null, true);
    else cb(new Error('Only Excel/CSV files allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseMonthString(monthStr) {
  if (monthStr === null || monthStr === undefined) return null;
  if (typeof monthStr === 'number') {
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + monthStr * 86400000);
    if (!isNaN(d.getTime())) return { month: d.getMonth() + 1, year: d.getFullYear() };
    return null;
  }
  const str = monthStr.toString().trim();
  if (!str || str === '-') return null;
  const numVal = parseFloat(str);
  if (!isNaN(numVal) && numVal > 30000 && numVal < 60000) {
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + numVal * 86400000);
    if (!isNaN(d.getTime())) return { month: d.getMonth() + 1, year: d.getFullYear() };
  }
  const mShort = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mShort) { const m = parseInt(mShort[1]); let y = parseInt(mShort[3]); y = y < 50 ? 2000+y : 1900+y; if (m >= 1 && m <= 12) return { month: m, year: y }; }
  const m1 = str.match(/^(\w+)\s*[-–]\s*(\d{4})$/);
  if (m1) { const idx = MONTH_NAMES.findIndex(m => m.toLowerCase() === m1[1].substring(0,3).toLowerCase()); if (idx >= 0) return { month: idx+1, year: parseInt(m1[2]) }; const fidx = FULL_MONTH_NAMES.findIndex(m => m.toLowerCase() === m1[1].toLowerCase()); if (fidx >= 0) return { month: fidx+1, year: parseInt(m1[2]) }; }
  const m2 = str.match(/^(\d{4})[-/](\d{1,2})$/); if (m2) return { month: parseInt(m2[2]), year: parseInt(m2[1]) };
  const m3 = str.match(/^(\d{1,2})[-/](\d{4})$/); if (m3) return { month: parseInt(m3[1]), year: parseInt(m3[2]) };
  const m4 = str.match(/^(\w+)\s+(\d{4})$/);
  if (m4) { const idx = MONTH_NAMES.findIndex(m => m.toLowerCase() === m4[1].substring(0,3).toLowerCase()); if (idx >= 0) return { month: idx+1, year: parseInt(m4[2]) }; }
  const m6 = str.match(/^(\d{4})[-/](\d{1,2})[-/]\d{1,2}$/); if (m6) return { month: parseInt(m6[2]), year: parseInt(m6[1]) };
  const dAttempt = new Date(str); if (!isNaN(dAttempt.getTime()) && dAttempt.getFullYear() > 2000) return { month: dAttempt.getMonth()+1, year: dAttempt.getFullYear() };
  return null;
}

function parseIndianNumber(val) {
  if (val === null || val === undefined || val === '-' || val === '') return 0;
  if (typeof val === 'number') return val;
  const str = val.toString().trim();
  if (str === '' || str === '-') return 0;
  const isNeg = str.startsWith('(') && str.endsWith(')') || str.startsWith('-');
  const cleaned = str.replace(/[₹,\s()\-]/g, '').trim();
  if (cleaned === '') return 0;
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return isNeg ? -num : num;
}

async function getGoldPrice(db, month, year) {
  let pm = month - 1, py = year;
  if (pm === 0) { pm = 12; py -= 1; }
  let r = await db.execute({ sql: 'SELECT price_per_gram FROM gold_prices WHERE year = ? AND month = ?', args: [py, pm] });
  if (r.rows.length === 0) r = await db.execute({ sql: 'SELECT price_per_gram FROM gold_prices WHERE year = ? AND month = ?', args: [year, month] });
  if (r.rows.length === 0) r = await db.execute('SELECT price_per_gram FROM gold_prices ORDER BY year DESC, month DESC LIMIT 1');
  return r.rows.length > 0 ? r.rows[0].price_per_gram : 0;
}

function isGoldCategory(cat) { return cat.toLowerCase().includes('gold'); }

// Download template for a member
router.get('/template/:memberId', async (req, res) => {
  try {
    const db = getDb();
    const memberResult = await db.execute({ sql: 'SELECT * FROM family_members WHERE id = ?', args: [req.params.memberId] });
    const member = memberResult.rows[0];
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const catsResult = await db.execute({ sql: 'SELECT DISTINCT category FROM monthly_entries WHERE family_member_id = ? ORDER BY category', args: [member.id] });
    const cats = catsResult.rows.length > 0 ? catsResult.rows.map(r => r.category) : ['PF', 'PPF', 'Mutual Fund', 'Share', 'NPS', 'LIC', 'RD'];

    const entriesResult = await db.execute({ sql: 'SELECT * FROM monthly_entries WHERE family_member_id = ? ORDER BY year ASC, month ASC', args: [member.id] });
    const monthMap = {};
    entriesResult.rows.forEach(e => {
      const key = `${MONTH_NAMES[e.month-1]} - ${e.year}`;
      if (!monthMap[key]) monthMap[key] = {};
      monthMap[key][e.category] = { invested: e.invested_amount, interest: e.current_value - e.invested_amount };
    });

    const rows = [];
    Object.entries(monthMap).forEach(([monthKey, catData]) => {
      const row = { 'Month': monthKey };
      cats.forEach(cat => { row[`${cat} - Invested`] = catData[cat]?.invested || 0; row[`${cat} - Interest`] = catData[cat]?.interest || 0; });
      rows.push(row);
    });

    if (rows.length === 0) {
      ['Jan - 2025', 'Feb - 2025', 'Mar - 2025'].forEach(m => {
        const row = { 'Month': m };
        cats.forEach(cat => { row[`${cat} - Invested`] = 0; row[`${cat} - Interest`] = 0; });
        rows.push(row);
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, member.name);
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${member.name}_Template.xlsx"`);
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Download ALL members template
router.get('/template-all', async (req, res) => {
  try {
    const db = getDb();
    const members = (await db.execute('SELECT * FROM family_members')).rows;
    const wb = XLSX.utils.book_new();

    for (const member of members) {
      const catsResult = await db.execute({ sql: 'SELECT DISTINCT category FROM monthly_entries WHERE family_member_id = ? ORDER BY category', args: [member.id] });
      const cats = catsResult.rows.length > 0 ? catsResult.rows.map(r => r.category) : ['PF', 'PPF', 'Mutual Fund', 'Share', 'NPS', 'LIC', 'RD'];
      const entriesResult = await db.execute({ sql: 'SELECT * FROM monthly_entries WHERE family_member_id = ? ORDER BY year ASC, month ASC', args: [member.id] });

      const monthMap = {};
      entriesResult.rows.forEach(e => {
        const key = `${MONTH_NAMES[e.month-1]} - ${e.year}`;
        if (!monthMap[key]) monthMap[key] = {};
        monthMap[key][e.category] = { invested: e.invested_amount, interest: e.current_value - e.invested_amount };
      });

      const rows = [];
      Object.entries(monthMap).forEach(([monthKey, catData]) => {
        const row = { 'Month': monthKey };
        cats.forEach(cat => { row[`${cat} - Invested`] = catData[cat]?.invested || 0; row[`${cat} - Interest`] = catData[cat]?.interest || 0; });
        rows.push(row);
      });

      if (rows.length === 0) {
        ['Jan - 2025', 'Feb - 2025', 'Mar - 2025'].forEach(m => {
          const row = { 'Month': m };
          cats.forEach(cat => { row[`${cat} - Invested`] = 0; row[`${cat} - Interest`] = 0; });
          rows.push(row);
        });
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, member.name);
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Family_NetWorth_Template.xlsx"');
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Export data
router.get('/export/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const db = getDb();
    let members;
    if (memberId === 'all') {
      members = (await db.execute('SELECT * FROM family_members')).rows;
    } else {
      const r = await db.execute({ sql: 'SELECT * FROM family_members WHERE id = ?', args: [memberId] });
      if (r.rows.length === 0) return res.status(404).json({ error: 'Member not found' });
      members = r.rows;
    }

    const wb = XLSX.utils.book_new();
    for (const member of members) {
      const entries = (await db.execute({ sql: 'SELECT * FROM monthly_entries WHERE family_member_id = ? ORDER BY year ASC, month ASC', args: [member.id] })).rows;
      const categories = [...new Set(entries.map(e => e.category))];
      const monthMap = {};
      entries.forEach(e => {
        const key = `${MONTH_NAMES[e.month-1]} - ${e.year}`;
        if (!monthMap[key]) monthMap[key] = { _month: e.month, _year: e.year };
        monthMap[key][e.category] = { invested: e.invested_amount, interest: e.current_value - e.invested_amount };
      });

      const rows = [];
      const sorted = Object.entries(monthMap).sort((a,b) => { if (a[1]._year !== b[1]._year) return a[1]._year - b[1]._year; return a[1]._month - b[1]._month; });
      sorted.forEach(([monthKey, catData]) => {
        const row = { 'Month': monthKey };
        let ti = 0, tint = 0;
        categories.forEach(cat => { const inv = catData[cat]?.invested || 0; const int = catData[cat]?.interest || 0; row[`${cat} - Invested`] = inv; row[`${cat} - Interest`] = int; ti += inv; tint += int; });
        row['Total Invested'] = ti; row['Total Interest'] = tint; row['Net Worth'] = ti + tint;
        rows.push(row);
      });

      if (rows.length > 0) { const ws = XLSX.utils.json_to_sheet(rows); XLSX.utils.book_append_sheet(wb, ws, member.name); }
    }
    if (wb.SheetNames.length === 0) return res.status(404).json({ error: 'No data to export' });
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = memberId === 'all' ? 'Family_NetWorth_Export.xlsx' : `${members[0].name}_NetWorth_Export.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Upload Excel and import data
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { replace } = req.body;

  try {
    const wb = XLSX.readFile(req.file.path, { cellDates: false, raw: false });
    const rawWbData = XLSX.readFile(req.file.path, { raw: true });
    const db = getDb();
    const members = (await db.execute('SELECT * FROM family_members')).rows;
    const memberMap = {}; members.forEach(m => { memberMap[m.name.toLowerCase()] = m.id; });

    const results = { imported: 0, skipped: 0, errors: [], details: [] };

    for (const sheetName of wb.SheetNames) {
      if (sheetName.toLowerCase() === 'instructions' || sheetName.toLowerCase() === 'consolidated') continue;
      const memberId = memberMap[sheetName.toLowerCase()];
      if (!memberId) { results.errors.push(`Sheet "${sheetName}" doesn't match any family member. Skipped.`); continue; }

      if (replace === 'true') {
        await db.execute({ sql: 'DELETE FROM monthly_entries WHERE family_member_id = ?', args: [memberId] });
      }

      const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { raw: false, defval: '' });
      const rawData = XLSX.utils.sheet_to_json(rawWbData.Sheets[sheetName], { raw: true, defval: '' });
      if (data.length === 0) { results.errors.push(`Sheet "${sheetName}" is empty. Skipped.`); continue; }

      const columns = Object.keys(data[0]);
      const monthColName = columns.find(c => c.toLowerCase() === 'month') || columns[0];

      // Find category columns with "XXX - Invested" pattern
      const categoryColumns = [];
      const debtColumns = [];
      const goldColumns = [];

      columns.forEach(col => {
        const match = col.match(/^(.+?)\s*[-–]\s*Invested$/i);
        if (match) {
          const catName = match[1].trim();
          const interestCol = columns.find(c => { const m = c.match(/^(.+?)\s*[-–]\s*Interest$/i); return m && m[1].trim().toLowerCase() === catName.toLowerCase(); });
          categoryColumns.push({ category: catName, investedCol: col, interestCol: interestCol || null });
        }
      });

      // Detect standalone debt columns
      columns.forEach(col => {
        const colLower = col.toLowerCase();
        if (colLower === 'month' || colLower === monthColName.toLowerCase()) return;
        if (col.match(/[-–]\s*(Invested|Interest)$/i)) return;
        if (colLower.includes('loan') || colLower.includes('debt') || colLower.includes('yet to pay') || colLower.includes('pl(')) {
          debtColumns.push({ category: 'Personal Loan (Debt)', col });
        }
      });

      // Detect standalone gold columns
      columns.forEach(col => {
        const colLower = col.toLowerCase();
        if (colLower === 'month' || colLower === monthColName.toLowerCase()) return;
        if (col.match(/[-–]\s*(Invested|Interest)$/i)) return;
        if (colLower.includes('gold') && !colLower.includes('loan') && !colLower.includes('debt')) {
          const handled = categoryColumns.some(c => c.category.toLowerCase().includes('gold'));
          if (!handled) goldColumns.push({ col });
        }
      });

      if (categoryColumns.length === 0) {
        // Try simple row format
        for (let idx = 0; idx < data.length; idx++) {
          const row = data[idx];
          const category = row['Category'] || row['category'] || '';
          const description = row['Description'] || row['description'] || '';
          const monthStr = row[monthColName] || '';
          const investedAmount = parseIndianNumber(rawData[idx]?.['Invested Amount'] || rawData[idx]?.['Invested'] || 0);
          const currentValue = parseIndianNumber(rawData[idx]?.['Current Value'] || rawData[idx]?.['Current'] || 0);
          if (!category || !description) { results.skipped++; continue; }
          const parsed = parseMonthString(monthStr);
          if (!parsed) { results.skipped++; continue; }
          await db.execute({
            sql: 'INSERT INTO monthly_entries (family_member_id, month, year, category, description, invested_amount, current_value) VALUES (?, ?, ?, ?, ?, ?, ?)',
            args: [memberId, parsed.month, parsed.year, category, description, investedAmount, currentValue]
          });
          results.imported++;
        }
        results.details.push(`${sheetName}: processed ${data.length} rows (simple format)`);
        continue;
      }

      // Wide format processing
      let sheetImported = 0, sheetSkipped = 0;
      for (let idx = 0; idx < data.length; idx++) {
        const row = data[idx];
        const monthStr = row[monthColName];
        const rawMonthStr = rawData[idx] ? rawData[idx][monthColName] : monthStr;
        let parsed = parseMonthString(monthStr);
        if (!parsed) parsed = parseMonthString(rawMonthStr);
        if (!parsed) {
          if (monthStr && monthStr !== '' && monthStr !== '-' && monthStr !== '0') results.errors.push(`Row ${idx+2} in "${sheetName}": Could not parse month "${monthStr}"`);
          sheetSkipped++; continue;
        }

        if (replace !== 'true') {
          await db.execute({ sql: 'DELETE FROM monthly_entries WHERE family_member_id = ? AND month = ? AND year = ?', args: [memberId, parsed.month, parsed.year] });
        }

        for (const { category, investedCol, interestCol } of categoryColumns) {
          const rawRow = rawData[idx] || row;
          const invested = parseIndianNumber(rawRow[investedCol]);
          const interest = interestCol ? parseIndianNumber(rawRow[interestCol]) : 0;
          if (invested === 0 && interest === 0) continue;

          const isDebt = category.toLowerCase().includes('loan') || category.toLowerCase().includes('debt');
          if (isDebt) {
            const debtAmount = invested || interest;
            if (debtAmount === 0) continue;
            await db.execute({ sql: 'INSERT INTO monthly_entries (family_member_id, month, year, category, description, invested_amount, current_value) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [memberId, parsed.month, parsed.year, 'Personal Loan (Debt)', category, 0, -Math.abs(debtAmount)] });
          } else if (isGoldCategory(category)) {
            const grams = invested;
            const goldPricePerGram = await getGoldPrice(db, parsed.month, parsed.year);
            const goldValue = grams * goldPricePerGram;
            await db.execute({ sql: 'INSERT INTO monthly_entries (family_member_id, month, year, category, description, invested_amount, current_value) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [memberId, parsed.month, parsed.year, 'Gold', grams + 'g', 0, goldValue] });
            if (goldPricePerGram === 0) results.errors.push(`Gold price not set for ${parsed.month}/${parsed.year}.`);
          } else {
            const currentValue = invested + interest;
            await db.execute({ sql: 'INSERT INTO monthly_entries (family_member_id, month, year, category, description, invested_amount, current_value) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [memberId, parsed.month, parsed.year, category, category, invested, currentValue] });
          }
          sheetImported++;
        }

        // Gold columns
        for (const { col } of goldColumns) {
          const rawRow = rawData[idx] || row;
          const grams = parseIndianNumber(rawRow[col]);
          if (grams === 0) continue;
          const goldPricePerGram = await getGoldPrice(db, parsed.month, parsed.year);
          await db.execute({ sql: 'INSERT INTO monthly_entries (family_member_id, month, year, category, description, invested_amount, current_value) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [memberId, parsed.month, parsed.year, 'Gold', grams + 'g', 0, grams * goldPricePerGram] });
          sheetImported++;
        }

        // Debt columns
        for (const { category, col } of debtColumns) {
          const rawRow = rawData[idx] || row;
          const debtAmount = parseIndianNumber(rawRow[col]);
          if (debtAmount === 0) continue;
          await db.execute({ sql: 'INSERT INTO monthly_entries (family_member_id, month, year, category, description, invested_amount, current_value) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [memberId, parsed.month, parsed.year, category, col, 0, -Math.abs(debtAmount)] });
          sheetImported++;
        }
      }

      results.imported += sheetImported;
      results.skipped += sheetSkipped;
      results.details.push(`${sheetName}: imported ${sheetImported} entries from ${data.length} rows (${sheetSkipped} skipped)`);
    }

    fs.unlinkSync(req.file.path);
    res.json({ message: `Successfully imported ${results.imported} entries`, imported: results.imported, skipped: results.skipped, errors: results.errors, details: results.details });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Error processing file: ' + err.message });
  }
});

module.exports = router;
