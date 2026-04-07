'use strict';

const express  = require('express');
const multer   = require('multer');
const XLSX     = require('xlsx');
const bcrypt   = require('bcryptjs');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── ADMIN PASSWORD ────────────────────────────────────────────────────────────
// Change this password! Set ADMIN_PASSWORD env variable on Render.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ─── DATA STORAGE ──────────────────────────────────────────────────────────────
// We store parsed data as JSON files so it survives server restarts on Render.
// NOTE: Render free tier has ephemeral storage — data resets on redeploy.
// For permanent storage, upgrade to a paid tier or use a database.
const DATA_DIR      = path.join(__dirname, 'data');
const VULN_FILE     = path.join(DATA_DIR, 'vuln.json');
const RES_FILE      = path.join(DATA_DIR, 'resolution.json');
const META_FILE     = path.join(DATA_DIR, 'meta.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── HELPERS ───────────────────────────────────────────────────────────────────
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch(e) { return fallback; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
}

function dateFromFilename(name) {
  const m = name.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
  if (m) return m[1].replace(/_/g, '-');
  const m2 = name.match(/(\d{2}[-_]\d{2}[-_]\d{4})/);
  if (m2) {
    const parts = m2[1].split(/[-_]/);
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function parseXLSX(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

function normaliseResRow(r) {
  const colMap = k => {
    const kl = k.toLowerCase();
    if (/computer/.test(kl))          return 'Computer Name';
    if (/vuln|patch|fix/.test(kl))    return 'Vulnerability';
    if (/status/.test(kl))            return 'Status';
    if (/date|resolved/.test(kl))     return 'Date';
    if (/office/.test(kl))            return 'Office';
    if (/note/.test(kl))              return 'Notes';
    return k;
  };
  const out = {};
  Object.entries(r).forEach(([k, v]) => { out[colMap(k)] = v; });
  return out;
}

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Explicit root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all: serve index.html for any unknown route
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Multer: store files in memory for parsing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// ─── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  if (token !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid password' });
  next();
}

// ─── ROUTES ────────────────────────────────────────────────────────────────────

// Admin login — verify password
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: ADMIN_PASSWORD });
  }
  return res.status(401).json({ error: 'Invalid password' });
});

// GET current data (for all viewers)
app.get('/api/data', (req, res) => {
  const dayStore = readJSON(VULN_FILE, {});
  const resData  = readJSON(RES_FILE, []);
  const meta     = readJSON(META_FILE, { lastUpdated: null, vulnFiles: [], resFiles: [] });
  res.json({ dayStore, resData, meta });
});

// Upload vuln files (admin only) — multiple files supported
app.post('/api/upload/vuln', requireAdmin, upload.array('files', 50), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });

  let dayStore = readJSON(VULN_FILE, {});
  const meta   = readJSON(META_FILE, { lastUpdated: null, vulnFiles: [], resFiles: [] });
  const loaded = [];

  req.files.forEach(file => {
    try {
      const rows    = parseXLSX(file.buffer);
      const dateKey = dateFromFilename(file.originalname);
      dayStore[dateKey] = (dayStore[dateKey] || []).concat(rows);
      if (!meta.vulnFiles.includes(file.originalname)) meta.vulnFiles.push(file.originalname);
      loaded.push({ name: file.originalname, date: dateKey, rows: rows.length });
    } catch(e) {
      console.error('Error parsing', file.originalname, e.message);
    }
  });

  meta.lastUpdated = new Date().toISOString();
  writeJSON(VULN_FILE, dayStore);
  writeJSON(META_FILE, meta);

  res.json({ success: true, loaded, days: Object.keys(dayStore).sort() });
});

// Upload resolution files (admin only) — multiple files supported
app.post('/api/upload/resolution', requireAdmin, upload.array('files', 50), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });

  let resData = readJSON(RES_FILE, []);
  const meta  = readJSON(META_FILE, { lastUpdated: null, vulnFiles: [], resFiles: [] });
  const loaded = [];

  req.files.forEach(file => {
    try {
      const rows = parseXLSX(file.buffer).map(normaliseResRow);
      resData = resData.concat(rows);
      if (!meta.resFiles.includes(file.originalname)) meta.resFiles.push(file.originalname);
      loaded.push({ name: file.originalname, rows: rows.length });
    } catch(e) {
      console.error('Error parsing', file.originalname, e.message);
    }
  });

  meta.lastUpdated = new Date().toISOString();
  writeJSON(RES_FILE, resData);
  writeJSON(META_FILE, meta);

  res.json({ success: true, loaded, total: resData.length });
});

// Clear all data (admin only)
app.delete('/api/data', requireAdmin, (req, res) => {
  writeJSON(VULN_FILE, {});
  writeJSON(RES_FILE, []);
  writeJSON(META_FILE, { lastUpdated: null, vulnFiles: [], resFiles: [] });
  res.json({ success: true });
});

// ─── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`VulnTrack server running on port ${PORT}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
});
