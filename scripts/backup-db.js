'use strict';
/**
 * Online, consistent SQLite backup (including expense-receipt BLOBs).
 * Usage: node scripts/backup-db.js --output /secure/backups/gcn-monitor-YYYYMMDD.sqlite
 * Writes nothing to the source database and does not overwrite an existing file.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Database=require('better-sqlite3');
function source() {
 const dir=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):path.resolve(__dirname,'..','data');
 return path.join(dir,'gcn-monitor.sqlite');
}
async function backupDatabase(sourcePath,targetPath) {
 const input=path.resolve(sourcePath),target=path.resolve(targetPath);
 if(input===target)throw Error('Sumber dan backup tidak boleh sama.');
 if(!fs.existsSync(input))throw Error('Database sumber tidak tersedia.');
 if(fs.existsSync(target))throw Error('Backup tujuan sudah ada; overwrite tidak diizinkan.');
 fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
 const db=new Database(input,{readonly:true,fileMustExist:true});
 try {
   await db.backup(target);
   const copy=new Database(target,{readonly:true,fileMustExist:true});
   try {
     const integrity=copy.pragma('integrity_check',{simple:true});
     if(integrity!=='ok')throw Error('Integrity check gagal: '+integrity);
     const bad=copy.pragma('foreign_key_check');
     if(bad.length)throw Error('Foreign key check gagal: '+bad.length);
     const count=(table)=>copy.prepare('SELECT COUNT(*) n FROM '+table).get().n;
     const names=copy.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name);
     const stats={tables:names.length,users:names.includes('users')?count('users'):0,projects:names.includes('projects')?count('projects'):0,expenses:names.includes('expenses')?count('expenses'):0,receipts:names.includes('expense_receipts')?count('expense_receipts'):0,invoices:names.includes('invoices')?count('invoices'):0};
     if(names.includes('expense_receipts')){
       for(const row of copy.prepare('SELECT bytes,sha256,data FROM expense_receipts').iterate()){
         const digest=crypto.createHash('sha256').update(row.data).digest('hex');
         if(row.data.length!==row.bytes||digest!==row.sha256)throw Error('Checksum bukti pengeluaran tidak sesuai.');
       }
     }
     return {integrity,stats,bytes:fs.statSync(target).size};
   }finally{copy.close();}
 }catch(error){
   // Only delete our newly-created invalid destination, never the source.
   try{fs.rmSync(target,{force:true});}catch(_e){}
   throw error;
 }finally{db.close();}
}
if(require.main===module){
 const at=process.argv.indexOf('--output'),output=at!==-1?process.argv[at+1]:null;
 if(!output){console.error('Gunakan --output /path/backup.sqlite');process.exitCode=2;}
 else backupDatabase(source(),output).then(result=>console.log('BACKUP VERIFIED '+JSON.stringify(result))).catch(e=>{console.error('Backup gagal:',e.message);process.exitCode=1;});
}
module.exports={backupDatabase,source};
