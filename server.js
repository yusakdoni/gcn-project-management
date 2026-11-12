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
if (NODE_ENV === 'production' && !process.env.DATA_DIR) throw new Error('DATA_DIR harus menunjuk volume persisten sebelum deployment.');
const secret = SESSION_SECRET || require('crypto').randomBytes(48).toString('hex');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
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
if (process.env.TRUST_PROXY === '1') app.set('trust proxy',1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
  scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'], frameSrc: ["'self'", 'blob:'], connectSrc: ["'self'"]
}}}));
app.use('/api/expenses/:id/receipt', express.json({ limit: '7.5mb' }));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use('/api',(req,res,next)=>{
 if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
 if(req.get('X-GCN-Request')!=='1')return res.status(403).json({error:'Header keamanan permintaan tidak valid.'});
 next();
});
class SQLiteSessionStore extends session.Store {
 constructor(database) {
  super();
  this.database=database;
  database.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expires_at INTEGER NOT NULL)');
  database.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  this.getStmt=database.prepare('SELECT sess,expires_at FROM sessions WHERE sid=?');
  this.setStmt=database.prepare('INSERT INTO sessions(sid,sess,expires_at) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess,expires_at=excluded.expires_at');
  this.deleteStmt=database.prepare('DELETE FROM sessions WHERE sid=?');
  this.touchStmt=database.prepare('UPDATE sessions SET expires_at=? WHERE sid=?');
 }
 get(sid,cb){try{const row=this.getStmt.get(sid);if(!row||row.expires_at<Date.now())return cb(null,null);cb(null,JSON.parse(row.sess));}catch(e){cb(e);}}
 set(sid,sess,cb){try{const exp=sess.cookie?.expires?new Date(sess.cookie.expires).getTime():Date.now()+4*60*60*1000;this.setStmt.run(sid,JSON.stringify(sess),exp);cb?.(null);}catch(e){cb?.(e);}}
 destroy(sid,cb){try{this.deleteStmt.run(sid);cb?.(null);}catch(e){cb?.(e);}}
 touch(sid,sess,cb){try{const exp=sess.cookie?.expires?new Date(sess.cookie.expires).getTime():Date.now()+4*60*60*1000;this.touchStmt.run(exp,sid);cb?.(null);}catch(e){cb?.(e);}}
}
app.use(session({
 name: 'gcn.sid', secret, resave: false, saveUninitialized: false,
 store: new SQLiteSessionStore(db),
 cookie: { httpOnly: true, sameSite: 'lax', secure: NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 4 },
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
const {setupExpenseApi}=require('./expense-api');
setupExpenseApi(app, db, requireAuth, requireRole);

// Frontend assets are public static code; the protected HTML page and APIs still require a session.
app.get('/styles.css', (_req, res) => res.sendFile(path.join(publicDir, 'styles.css')));
app.get('/app.js', (_req, res) => res.sendFile(path.join(publicDir, 'app.js')));
app.get('/session-ui.js', (_req, res) => res.sendFile(path.join(publicDir, 'session-ui.js')));

// Serve only explicitly enumerated frontend pages and assets. Never expose data/*.sqlite or source files.
app.get('/',requireAuth,(_req,res)=>res.sendFile(path.join(publicDir,'index.html')));
app.get('/index.html',requireAuth,(_req,res)=>res.sendFile(path.join(publicDir,'index.html')));
app.use('/api',(_req,res)=>res.status(404).json({error:'API tidak ditemukan.'}));
app.use((_req,res)=>res.status(404).send('Halaman tidak ditemukan.'));

app.use((err, _req, res, _next) => {
 console.error('Request error:', err.message);
 res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});
const server = app.listen(PORT, () => console.log(`GCN Monitor berjalan di http://localhost:${PORT} (${NODE_ENV})`));
function shutdown() { server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
