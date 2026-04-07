'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const DATA_DIR  = path.join(__dirname, 'data');
const VULN_FILE = path.join(DATA_DIR, 'vuln.json');
const RES_FILE  = path.join(DATA_DIR, 'resolution.json');
const META_FILE = path.join(DATA_DIR, 'meta.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch(e) { return fallback; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
}

app.use(cors());

// Render free tier hard-caps incoming request bodies.
// We chunk uploads on the client into 2000-row batches so each
// request stays well under 10 MB — no limit issues on any host.
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── catch malformed JSON bodies and return a clean error ──────
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body — request may have been truncated. Try a smaller batch.' });
  }
  next(err);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || token !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD)
    return res.json({ success: true, token: ADMIN_PASSWORD });
  return res.status(401).json({ error: 'Invalid password' });
});

app.get('/api/data', (req, res) => {
  const dayStore = readJSON(VULN_FILE, {});
  const resData  = readJSON(RES_FILE, []);
  const meta     = readJSON(META_FILE, { lastUpdated: null, vulnFiles: [], resFiles: [] });
  res.json({ dayStore, resData, meta });
});

// ── Chunked vuln upload ────────────────────────────────────────
// Client sends rows in batches. Each batch hits this endpoint.
// Body: { dateKey, rows, filename, chunkIndex, totalChunks }
app.post('/api/upload/vuln', requireAdmin, (req, res) => {
  const { dateKey, rows, filename, chunkIndex, totalChunks } = req.body;
  if (!dateKey || !Array.isArray(rows))
    return res.status(400).json({ error: 'Missing dateKey or rows array' });

  let dayStore = readJSON(VULN_FILE, {});
  const meta   = readJSON(META_FILE, { lastUpdated: null, vulnFiles: [], resFiles: [] });

  // Always append — works for both single-shot and chunked uploads
  dayStore[dateKey] = (dayStore[dateKey] || []).concat(rows);

  if (!meta.vulnFiles.includes(filename)) meta.vulnFiles.push(filename);
  meta.lastUpdated = new Date().toISOString();

  writeJSON(VULN_FILE, dayStore);
  writeJSON(META_FILE, meta);

  const isLast = (totalChunks == null) || (Number(chunkIndex) + 1 >= Number(totalChunks));
  res.json({
    success: true,
    dateKey,
    chunkIndex: chunkIndex ?? 0,
    totalChunks: totalChunks ?? 1,
    rowsInChunk: rows.length,
    totalRowsForDay: dayStore[dateKey].length,
    done: isLast,
    days: isLast ? Object.keys(dayStore).sort() : []
  });
});

// ── Chunked resolution upload ──────────────────────────────────
// Body: { rows, filename, chunkIndex, totalChunks }
app.post('/api/upload/resolution', requireAdmin, (req, res) => {
  const { rows, filename, chunkIndex, totalChunks } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'Missing rows array' });

  let resData = readJSON(RES_FILE, []);
  const meta  = readJSON(META_FILE, { lastUpdated: null, vulnFiles: [], resFiles: [] });

  resData = resData.concat(rows);

  if (!meta.resFiles.includes(filename)) meta.resFiles.push(filename);
  meta.lastUpdated = new Date().toISOString();

  writeJSON(RES_FILE, resData);
  writeJSON(META_FILE, meta);

  const isLast = (totalChunks == null) || (Number(chunkIndex) + 1 >= Number(totalChunks));
  res.json({
    success: true,
    chunkIndex: chunkIndex ?? 0,
    totalChunks: totalChunks ?? 1,
    rowsInChunk: rows.length,
    total: resData.length,
    done: isLast
  });
});

// ── Clear all data ─────────────────────────────────────────────
app.delete('/api/data', requireAdmin, (req, res) => {
  writeJSON(VULN_FILE, {});
  writeJSON(RES_FILE, []);
  writeJSON(META_FILE, { lastUpdated: null, vulnFiles: [], resFiles: [] });
  res.json({ success: true });
});

// ── Global error handler ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON parse failed — body may have been truncated.' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`VulnTrack server running on port ${PORT}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
});
