'use strict';
/**
 * Safe legacy browser data importer for GCN MONITOR student MVP.
 * DRY RUN (default): node scripts/import-legacy.js --file ./browser-export.json --source-id browser-A --user-id 1
 * APPLY: node scripts/import-legacy.js --file ./browser-export.json --source-id browser-A --user-id 1 --apply --backup-output /secure/backups/pre-import.sqlite
 *
 * Existing project rows are never overwritten. Missing project codes are BLOCKED,
 * invoices with an existing number are BLOCKED (not merged), costs become DRAFT
 * without attachments and NEVER affect approved budget.
 */
const fs=require('node:fs');
const path=require('node:path');
const Database=require('better-sqlite3');
const {source,backupDatabase}=require('./backup-db');
function getArg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
const money=n=>Number.isSafeInteger(Number(n))&&Number(n)>0&&Number(n)<=9_000_000_000_000_000;
const date=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
function validateExport(raw){
 if(!raw||raw.format!=='GCN_MONITOR_LEGACY_EXPORT_v1'||!raw.legacy||typeof raw.legacy!=='object')throw Error('Arsip bukan export GCN_MONITOR_LEGACY_EXPORT_v1.');
 const fields=['gcnP','gcnC','gcnI'];for(const key of fields)if(raw.legacy[key]!==undefined&&!Array.isArray(raw.legacy[key]))throw Error('Data '+key+' bukan array. Jangan impor data yang rusak.');
 return {projects:raw.legacy.gcnP||[],costs:raw.legacy.gcnC||[],invoices:raw.legacy.gcnI||[]};
}
function planImport(db,legacy,sourceId,userId){
 const user=db.prepare('SELECT id,role,active FROM users WHERE id=?').get(userId);
 if(!user||!user.active||user.role!=='admin')throw Error('User import harus akun admin aktif.');
 if(!/^[a-zA-Z0-9_-]{3,64}$/.test(sourceId))throw Error('source-id harus 3–64 karakter alfanumerik, dash atau underscore.');
 db.exec('CREATE TABLE IF NOT EXISTS legacy_import_entries (source_key TEXT PRIMARY KEY,entity TEXT NOT NULL,imported_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 const existingProject=db.prepare('SELECT id,code FROM projects WHERE code=?');
 const existingInvoice=db.prepare('SELECT id FROM invoices WHERE number=? COLLATE NOCASE');
 const seen=db.prepare('SELECT 1 FROM legacy_import_entries WHERE source_key=?');
 const projectByLegacyId=new Map();
 const issues=[],projects=[],costs=[],invoices=[];
 for(const p of legacy.projects){
  const id=String(p?.id??''),code=String(p?.code||'').trim();
  if(!id||!code){issues.push('Proyek tanpa ID/kode pada export; REVIEW');continue;}
  const found=existingProject.get(code);
  if(found)projectByLegacyId.set(id,found.id);
  else issues.push('Kode proyek '+code+' tidak ditemukan di database; buat/tinjau proyek dahulu dan jalankan ulang import.');
 }
 for(const e of legacy.costs){
  const legacyId=String(e?.id??''),projectId=projectByLegacyId.get(String(e?.projectId??'')),key=sourceId+':expense:'+legacyId;
  if(!legacyId||!projectId){issues.push('Biaya '+legacyId+' tidak memiliki proyek valid; BLOCKED');continue;}
  if(seen.get(key))continue;
  if(!money(e.amount)||!date(e.date)||!['Material','Tenaga kerja','Jasa','Transportasi','Lainnya'].includes(e.category)||typeof e.description!=='string'||!e.description.trim()){
    issues.push('Biaya '+legacyId+' memiliki field tidak valid; BLOCKED');continue;
  }
  costs.push({key,projectId,amount:Number(e.amount),date:e.date,category:e.category,description:e.description.trim().slice(0,1000)});
 }
 for(const i of legacy.invoices){
  const legacyId=String(i?.id??''),projectId=projectByLegacyId.get(String(i?.projectId??'')),key=sourceId+':invoice:'+legacyId,number=String(i?.number||'').trim();
  if(!legacyId||!projectId||!/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,59}$/.test(number)||!money(i.amount)||!date(i.due)){
    issues.push('Invoice '+legacyId+' tidak valid/relasi proyek hilang; BLOCKED');continue;
  }
  if(seen.get(key))continue;
  if(existingInvoice.get(number)){issues.push('Invoice '+number+' sudah ada; jangan menimpa atau menggandakan pembayaran. REVIEW');continue;}
  const paymentRows=Array.isArray(i.payments)?i.payments:[];
  let sum=0;let valid=true;
  for(const p of paymentRows){
   if(!money(p?.amount)||!date(p?.date)||typeof p.note!=='string'||p.note.length>500){valid=false;break;}
   sum+=Number(p.amount);
  }
  if(!valid||sum>Number(i.amount)){issues.push('Invoice '+number+' memiliki pembayaran tidak valid; BLOCKED');continue;}
  invoices.push({key,projectId,number,amount:Number(i.amount),due:i.due,payments:paymentRows});
 }
 return {summary:{projectsMatched:projectByLegacyId.size,costsToDraft:costs.length,invoicesToCreate:invoices.length,reviewIssues:issues.length},issues,projects,costs,invoices};
}
async function main(){
 const file=getArg('--file'),sourceId=getArg('--source-id'),userId=Number(getArg('--user-id'));
 if(!file||!sourceId||!Number.isSafeInteger(userId)||userId<=0)throw Error('Wajib --file, --source-id dan --user-id ID admin.');
 const raw=fs.readFileSync(path.resolve(file),'utf8');
 if(raw.length>10_000_000)throw Error('File JSON terlalu besar; lakukan review manual.');
 const legacy=validateExport(JSON.parse(raw));
 const db=new Database(source(),{fileMustExist:true});db.pragma('foreign_keys=ON');
 let plan;
 try{
  plan=planImport(db,legacy,sourceId,userId);
  console.log('LEGACY DRY-RUN SUMMARY '+JSON.stringify(plan.summary));
  for(const issue of plan.issues)console.log('REVIEW '+issue);
  if(!process.argv.includes('--apply'))return;
  if(plan.issues.length)throw Error('Ada isu yang wajib di-review; import otomatis diblokir.');
  const out=getArg('--backup-output');
  if(!out)throw Error('Mode --apply wajib --backup-output untuk backup database.');
  await backupDatabase(source(),out);
  db.transaction(()=>{
   const addCost=db.prepare("INSERT INTO expenses(project_id,category,description,amount,expense_date,status,created_by) VALUES(?,?,?,?,?,'DRAFT',?)");
   const event=db.prepare("INSERT INTO expense_events(expense_id,actor_id,action,from_status,to_status,reason) VALUES(?,?, 'LEGACY_IMPORTED',NULL,'DRAFT','Imported from reviewed browser export')");
   const addInv=db.prepare('INSERT INTO invoices(project_id,number,amount,due_date,created_by) VALUES(?,?,?,?,?)');
   const pay=db.prepare('INSERT INTO invoice_payments(invoice_id,amount,paid_date,note,created_by) VALUES(?,?,?,?,?)');
   const record=db.prepare('INSERT INTO legacy_import_entries(source_key,entity,imported_id) VALUES(?,?,?)');
   const already=db.prepare('SELECT 1 FROM legacy_import_entries WHERE source_key=?');
   for(const e of plan.costs){
    if(already.get(e.key))continue;
    const id=Number(addCost.run(e.projectId,e.category,e.description,e.amount,e.date,userId).lastInsertRowid);
    event.run(id,userId);record.run(e.key,'expense',id);
   }
   for(const e of plan.invoices){
    if(already.get(e.key))continue;
    if(db.prepare('SELECT 1 FROM invoices WHERE number=? COLLATE NOCASE').get(e.number))throw Error('Invoice duplicate detected during apply; transaction rolled back.');
    const id=Number(addInv.run(e.projectId,e.number,e.amount,e.due,userId).lastInsertRowid);
    for(const p of e.payments)pay.run(id,p.amount,p.date,p.note,userId);
    record.run(e.key,'invoice',id);
   }
  })();
  console.log('IMPORT APPLIED; original browser export untouched; imported costs are DRAFT, not approved.');
 }finally{db.close();}
}
if(require.main===module)main().catch(e=>{console.error('IMPORT BLOCKED:',e.message);process.exitCode=1;});
module.exports={validateExport,planImport};
