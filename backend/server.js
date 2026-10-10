/**
 * Megy Prints Backend — Express API Server
 * Sprint 1 scaffold: health check + basic middleware
 * Ready for: Auth routes, Order routes, Admin routes
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ──
app.use(helmet());
// CORS fails CLOSED: only the explicitly-configured frontend origin(s) may call
// the API with credentials. Never fall back to '*' (a wildcard + credentials is
// a footgun that reflects any origin). Set FRONTEND_URL (comma-separated for
// multiple, e.g. "https://app.vercel.app,http://localhost:3000").
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    // allow same-origin / curl / server-to-server (no Origin header)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

// Access log — CWE-117 hardened. The raw `morgan('combined')` copied the URL,
// Referer and User-Agent (all attacker-controlled) into the log verbatim, so a
// crafted header could inject CR/LF + a closing quote and forge whole log lines
// (fake admin requests, spoofed IPs) that mislead an operator or a log pipeline.
// Route those three fields through a sanitizer that drops control chars (CR/LF/
// ESC/NUL — via char code, so no control-char regex) and escapes the backslash
// + double-quote morgan uses as the field delimiter, so a payload can never
// break out of its own quoted field. Benign traffic logs byte-for-byte as
// 'combined' (missing values still render as '-').
function sanitizeLogValue(v) {
  if (v == null) return '-';
  let out = '';
  for (const ch of String(v)) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c === 0x7f) continue; // drop control chars
    if (ch === '\\') { out += '\\\\'; continue; }
    if (ch === '"') { out += '\\"'; continue; }
    out += ch;
  }
  return out;
}
morgan.token('url', (req) => sanitizeLogValue(req.originalUrl || req.url));
morgan.token('referrer', (req) => sanitizeLogValue(req.headers.referer || req.headers.referrer));
morgan.token('user-agent', (req) => sanitizeLogValue(req.headers['user-agent']));
app.use(morgan(
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version"'
  + ' :status :res[content-length] ":referrer" ":user-agent"'
));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// ── Health Check ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API Routes ──
app.use('/api/admin', require('./routes/admin'));
// app.use('/api/auth', require('./routes/auth'));
// app.use('/api/orders', require('./routes/orders'));

// ── 404 ──
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ──
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Megy Prints API running on port ${PORT}`);
});
