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
app.use(morgan('combined'));

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
