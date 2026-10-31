'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_SECRET = process.env.SESSION_SECRET;
if (NODE_ENV === 'production' && (!SESSION_SECRET || SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET minimal 32 karakter wajib diatur untuk production.');
}
const secret = SESSION_SECRET || require('crypto').randomBytes(48).toString('hex');
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'gcn-monitor.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 full_name TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','project_manager','project_staff','finance_staff')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 action TEXT NOT NULL,
 details TEXT,
 ip_address TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
  scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"]
}}}));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(session({
 name: 'gcn.sid', secret, resave: false, saveUninitialized: false,
 cookie: { httpOnly: true, sameSite: 'lax', secure: NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 4 },
 // express-session's MemoryStore is for local demonstration only; replace for deployment.
}));
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false,
 message: { error: 'Terlalu banyak percobaan login. Coba lagi beberapa menit kemudian.' } });
const log = db.prepare('INSERT INTO audit_logs(user_id, action, details, ip_address) VALUES(?,?,?,?)');
const writeLog = (req, action, details = '') => {
 try { log.run(req.session?.user?.id || null, action, String(details).slice(0, 500), req.ip); } catch (e) { console.error('Audit log write failed:', e.message); }
};
function requireAuth(req, res, next) {
 if (!req.session.user) {
   if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sesi tidak tersedia. Silakan masuk kembali.' });
   return res.redirect('/login');
 }
 const fresh = db.prepare('SELECT id,email,full_name,role,active FROM users WHERE id=?').get(req.session.user.id);
 if (!fresh || !fresh.active) {
   return req.session.destroy(() => req.path.startsWith('/api/') ? res.status(401).json({ error: 'Akun tidak aktif.' }) : res.redirect('/login'));
 }
 req.session.user = { id: fresh.id, email: fresh.email, fullName: fresh.full_name, role: fresh.role };
 next();
}
function requireRole(...roles) {
 return (req, res, next) => roles.includes(req.session.user?.role)
   ? next() : res.status(403).json({ error: 'Anda tidak memiliki izin untuk tindakan ini.' });
}
const publicDir = __dirname;
app.get('/login', (req, res) => req.session.user ? res.redirect('/') : res.sendFile(path.join(publicDir, 'login.html')));
app.get('/login.css', (_req, res) => res.sendFile(path.join(publicDir, 'login.css')));
app.get('/login.js', (_req, res) => res.sendFile(path.join(publicDir, 'login.js')));
// Login branding assets must be reachable before authentication.
app.get('/assets/gcn-logoweb.png', (_req, res) => res.sendFile(path.join(publicDir, 'assets', 'gcn-logoweb.png')));
app.get('/assets/favicon.png', (_req, res) => res.sendFile(path.join(publicDir, 'assets', 'favicon.png')));
app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'GCN Monitor', mode: NODE_ENV }));
app.post('/api/auth/login', loginLimiter, (req, res) => {
 const email = String(req.body.email || '').trim().toLowerCase();
 const password = String(req.body.password || '');
 if (!email || !password || email.length > 254 || password.length > 200) return res.status(400).json({ error: 'Email dan password wajib diisi dengan format yang valid.' });
 const user = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(email);
 const valid = user ? bcrypt.compareSync(password, user.password_hash) : false;
 if (!valid) {
   writeLog(req, 'LOGIN_FAILED', `email=${email}`);
   return res.status(401).json({ error: 'Email atau password tidak sesuai.' });
 }
 req.session.regenerate(err => {
   if (err) return res.status(500).json({ error: 'Login belum dapat diproses. Coba lagi.' });
   req.session.user = { id: user.id, email: user.email, fullName: user.full_name, role: user.role };
   writeLog(req, 'LOGIN_SUCCESS', `role=${user.role}`);
   req.session.save(saveErr => saveErr ? res.status(500).json({ error: 'Sesi gagal disimpan. Coba lagi.' }) : res.json({ user: req.session.user }));
 });
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.session.user }));
app.post('/api/auth/logout', requireAuth, (req, res) => {
 writeLog(req, 'LOGOUT');
 req.session.destroy(err => {
   res.clearCookie('gcn.sid', { httpOnly: true, sameSite: 'lax', secure: NODE_ENV === 'production' });
   return err ? res.status(500).json({ error: 'Logout gagal. Coba lagi.' }) : res.json({ ok: true });
 });
});
// Server-side authorization example: only admins can list account metadata.
app.get('/api/admin/users', requireAuth, requireRole('admin'), (_req, res) => {
 const users = db.prepare('SELECT id,email,full_name AS fullName,role,active,created_at AS createdAt FROM users ORDER BY id').all();
 res.json({ users });
});
app.get('/api/admin/audit-logs', requireAuth, requireRole('admin'), (_req, res) => {
 const rows = db.prepare(`SELECT a.id,a.action,a.details,a.ip_address AS ipAddress,a.created_at AS createdAt,u.email
 FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200`).all();
 res.json({ logs: rows });
});
// Frontend assets are public static code; the protected HTML page and APIs still require a session.
app.get('/styles.css', (_req, res) => res.sendFile(path.join(publicDir, 'styles.css')));
app.get('/app.js', (_req, res) => res.sendFile(path.join(publicDir, 'app.js')));
app.get('/session-ui.js', (_req, res) => res.sendFile(path.join(publicDir, 'session-ui.js')));

// Serve the existing demo only after a fresh server-side session check.
app.use((req, res, next) => {
 if (req.path.startsWith('/api/')) return next();
 if (req.path === '/login' || req.path === '/health') return next();
 return requireAuth(req, res, next);
});
app.use(express.static(publicDir, { index: 'index.html', dotfiles: 'deny', setHeaders(res, filePath) {
 if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
}}));
app.use((err, _req, res, _next) => {
 console.error('Request error:', err.message);
 res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});
const server = app.listen(PORT, () => console.log(`GCN Monitor berjalan di http://localhost:${PORT} (${NODE_ENV})`));
function shutdown() { server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
