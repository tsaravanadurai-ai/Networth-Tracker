const { getDb } = require('../db');

const GOODRETURNS_URL = 'https://www.goodreturns.in/gold-rates/chennai.html';

async function fetchChennaiGoldPrice() {
  console.log('[GoldCron] Fetching Chennai 22K gold price from GoodReturns...');

  const res = await fetch(GOODRETURNS_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NetworthTracker/1.0)',
      'Accept': 'text/html',
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const html = await res.text();

  // Parse 22K gold price per gram from the page
  // The page contains a table with "22K" and per-gram prices like "₹13,370"
  // Look for pattern: 22K Gold /g followed by ₹XX,XXX
  let price = null;

  // Method 1: Look for "22K Gold /g" section with price
  const match1 = html.match(/22K\s*Gold\s*\/g[\s\S]*?₹\s*([\d,]+)/i);
  if (match1) {
    price = parseFloat(match1[1].replace(/,/g, ''));
  }

  // Method 2: Look for 22 karat in the price table (1 gram row)
  if (!price) {
    const match2 = html.match(/22\s*(?:karat|carat|K)[\s\S]*?₹\s*([\d,]+)\s*(?:\/g|per\s*gram)/i);
    if (match2) {
      price = parseFloat(match2[1].replace(/,/g, ''));
    }
  }

  // Method 3: Look in the structured table for 1 gram 22K
  if (!price) {
    // The table has rows like: | 1 | ₹14,586 | ₹13,370 | ₹11,145 |
    // 22K is the second price column
    const tableMatch = html.match(/>\s*1\s*<[\s\S]*?₹\s*[\d,]+[\s\S]*?₹\s*([\d,]+)/);
    if (tableMatch) {
      price = parseFloat(tableMatch[1].replace(/,/g, ''));
    }
  }

  if (!price || isNaN(price) || price < 1000) {
    throw new Error('Could not parse 22K gold price from GoodReturns page');
  }

  return price;
}

async function fetchAndStoreGoldPrice() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  try {
    const pricePerGram = await fetchChennaiGoldPrice();
    console.log(`[GoldCron] Chennai 22K gold price: ₹${pricePerGram}/gram`);

    const db = getDb();
    const existing = await db.execute({
      sql: 'SELECT id FROM gold_prices WHERE month = ? AND year = ?',
      args: [month, year],
    });

    if (existing.rows.length > 0) {
      await db.execute({
        sql: 'UPDATE gold_prices SET price_per_gram = ?, updated_at = CURRENT_TIMESTAMP WHERE month = ? AND year = ?',
        args: [pricePerGram, month, year],
      });
      console.log(`[GoldCron] Updated gold price for ${month}/${year}: ₹${pricePerGram}/gram`);
    } else {
      await db.execute({
        sql: 'INSERT INTO gold_prices (month, year, price_per_gram) VALUES (?, ?, ?)',
        args: [month, year, pricePerGram],
      });
      console.log(`[GoldCron] Inserted gold price for ${month}/${year}: ₹${pricePerGram}/gram`);
    }

    return pricePerGram;
  } catch (err) {
    console.error('[GoldCron] Failed to fetch gold price:', err.message);
    throw err;
  }
}

function startGoldPriceCron() {
  // Run immediately on startup (if price missing for current month)
  checkAndFetchIfMissing();

  // Check every hour if it's the 1st of the month and price is missing
  setInterval(() => {
    const now = new Date();
    if (now.getDate() === 1) {
      checkAndFetchIfMissing();
    }
  }, 60 * 60 * 1000);

  console.log('[GoldCron] Gold price auto-fetch scheduled (1st of each month).');
}

async function checkAndFetchIfMissing() {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const db = getDb();

    const existing = await db.execute({
      sql: 'SELECT id FROM gold_prices WHERE month = ? AND year = ?',
      args: [month, year],
    });

    if (existing.rows.length === 0) {
      console.log(`[GoldCron] No price for ${month}/${year}, fetching...`);
      await fetchAndStoreGoldPrice();
    }
  } catch (err) {
    console.error('[GoldCron] Check failed:', err.message);
  }
}

module.exports = { startGoldPriceCron, fetchAndStoreGoldPrice };
