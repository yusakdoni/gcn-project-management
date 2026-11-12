'use strict';
/**
 * Non-destructive restore validation: reads a backup and copies it to a temporary
 * database, checks integrity, FK constraints and receipt hashes.
 * NEVER overwrites the existing running application database.
 * Usage: node scripts/verify-restore.js --file /secure/backups/gcn-monitor.sqlite
 */
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const Database=require('better-sqlite3');
function verifyRestore(filename){
 const original=path.resolve(filename);
 if(!fs.existsSync(original))throw Error('File backup tidak ditemukan.');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gcn-restore-'));
 let db;try{
  const recovered=path.join(dir,'restored.sqlite');
  fs.copyFileSync(original,recovered);
  db=new Database(recovered,{readonly:true,fileMustExist:true});
  if(db.pragma('integrity_check',{simple:true})!=='ok')throw Error('Integrity check gagal.');
  db.pragma('foreign_keys=ON');
  if(db.pragma('foreign_key_check').length)throw Error('Foreign-key integrity gagal.');
  const count=(name)=>db.prepare('SELECT COUNT(*) AS n FROM '+name).get().n;
  const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
  for(const table of ['users','projects','expenses','expense_receipts','expense_events','invoices','invoice_payments']){
    if(!tables.has(table))throw Error('Tabel wajib hilang: '+table);
  }
  let verified=0;
  for(const row of db.prepare('SELECT bytes,sha256,data FROM expense_receipts').iterate()){
    if(row.data.length!==row.bytes||crypto.createHash('sha256').update(row.data).digest('hex')!==row.sha256)throw Error('Checksum bukti tidak cocok.');
    verified++;
  }
  return {integrity:'ok',projects:count('projects'),expenses:count('expenses'),invoices:count('invoices'),receiptChecksumsVerified:verified};
 }finally{db?.close();fs.rmSync(dir,{force:true,recursive:true});}
}
if(require.main===module){
 const i=process.argv.indexOf('--file'),file=i>=0?process.argv[i+1]:null;
 if(!file){console.error('Gunakan --file /path/backup.sqlite');process.exitCode=2;}
 else{try{console.log('RESTORE VERIFICATION PASSED '+JSON.stringify(verifyRestore(file)));}catch(e){console.error('Restore verification failed:',e.message);process.exitCode=1;}}
}
module.exports={verifyRestore};
