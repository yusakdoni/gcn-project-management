'use strict';
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));
(async () => {
 try {
  const email = (await ask('Email pengguna: ')).trim().toLowerCase();
  const fullName = (await ask('Nama lengkap: ')).trim();
  const role = (await ask('Role (admin/project_manager/project_staff/finance_staff): ')).trim();
  const password = (await ask('Password (minimal 12 karakter): '));
  if (!/^\S+@\S+\.\S+$/.test(email) || !fullName || fullName.length > 120) throw new Error('Email atau nama tidak valid.');
  if (!['admin','project_manager','project_staff','finance_staff'].includes(role)) throw new Error('Role tidak valid.');
  if (password.length < 12 || password.length > 200) throw new Error('Password harus 12–200 karakter.');
  const dataDir = path.join(__dirname, '..', 'data'); fs.mkdirSync(dataDir, {recursive:true});
  const db = new Database(path.join(dataDir, 'gcn-monitor.sqlite'));
  db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE COLLATE NOCASE,full_name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','project_manager','project_staff','finance_staff')),active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,action TEXT NOT NULL,details TEXT,ip_address TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  db.prepare('INSERT INTO users(email,full_name,password_hash,role) VALUES(?,?,?,?)').run(email, fullName, bcrypt.hashSync(password, 12), role);
  db.close(); console.log(`Akun ${email} berhasil dibuat dengan role ${role}. Password tidak disimpan dalam plaintext.`);
 } catch (e) { console.error('Gagal membuat akun:', e.message); process.exitCode = 1; }
 finally { rl.close(); }
})();
