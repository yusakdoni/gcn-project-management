'use strict';
const fs = require('fs');
const path = require('path');

// Additive, versioned migrations. Existing authentication tables are untouched.
function migrateBusiness(db) {
  const directory = path.join(__dirname, 'migrations');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const files = fs.readdirSync(directory).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  for (const file of files) {
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(file)) continue;
    const sql = fs.readFileSync(path.join(directory, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(version) VALUES(?)').run(file);
    })();
  }
}
module.exports = { migrateBusiness };
