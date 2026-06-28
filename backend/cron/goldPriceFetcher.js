const { getDb } = require('../db');

const GOLD_API_URL = 'https://www.goldapi.io/api/XAU/INR';

async function fetchAndStoreGoldPrice() {
  const apiKey = process.env.GOLD_API_KEY;
  if (!apiKey) {
    console.log('[GoldCron] GOLD_API_KEY not set, skipping auto-fetch.');
    return;
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  console.log(`[GoldCron] Fetching gold price for ${month}/${year}...`);

  try {
    const res = await fetch(GOLD_API_URL, {
      headers: {
        'x-access-token': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[GoldCron] API error ${res.status}: ${text}`);
      return;
    }

    const data = await res.json();
    const pricePerGram = data.price_gram_22k;

    if (!pricePerGram || pricePerGram <= 0) {
      console.error('[GoldCron] Invalid price received:', data);
      return;
    }

    console.log(`[GoldCron] 22K gold price: ₹${pricePerGram}/gram`);

    const db = getDb();
    // Check if entry already exists
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
  } catch (err) {
    console.error('[GoldCron] Failed to fetch gold price:', err.message);
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
  }, 60 * 60 * 1000); // every hour

  console.log('[GoldCron] Gold price auto-fetch scheduled (1st of each month).');
}

async function checkAndFetchIfMissing() {
  try {
    const apiKey = process.env.GOLD_API_KEY;
    if (!apiKey) return;

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
