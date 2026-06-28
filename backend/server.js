const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initializeDatabase } = require('./db');
const authRoutes = require('./routes/auth');
const entriesRoutes = require('./routes/entries');
const reportsRoutes = require('./routes/reports');
const excelRoutes = require('./routes/excel');
const goldRoutes = require('./routes/gold');
const extrasRoutes = require('./routes/extras');

const { startGoldPriceCron } = require('./cron/goldPriceFetcher');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '../frontend/build')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/api/auth', authRoutes);
app.use('/api/entries', entriesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/excel', excelRoutes);
app.use('/api/gold', goldRoutes);
app.use('/api/extras', extrasRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

async function start() {
  await initializeDatabase();
  startGoldPriceCron();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
