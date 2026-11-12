'use strict';
const crypto = require('crypto');
const Database = require('better-sqlite3');

const MAX_FILE = 5 * 1024 * 1024;
const CATEGORIES = new Set(['Material', 'Tenaga kerja', 'Jasa', 'Transportasi', 'Lainnya']);
const ACTIVE = "('APPROVED','CANCEL_PENDING')";

function validContent(buffer, declared) {
  if (buffer.length < 4 || buffer.length > MAX_FILE) return null;
  if (declared === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (declared === 'image/png' && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (declared === 'application/pdf' && buffer.subarray(0,5).toString() === '%PDF-') return 'application/pdf';
  return null;
}
function toId(v) { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; }
function jsonError(res, status, message) { return res.status(status).json({ error: message }); }
function roleCanSubmit(role) { return role === 'admin' || role === 'finance_staff'; }
function moneyInt(value, allowZero = false) {
 const n = Number(value);
 return Number.isSafeInteger(n) && n >= (allowZero ? 0 : 1) && n <= 9_000_000_000_000_000 ? n : null;
}
function setupExpenseApi(app, db, requireAuth, requireRole) {
 db.exec("CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, client TEXT NOT NULL, manager_name TEXT NOT NULL DEFAULT '', manager_user_id INTEGER REFERENCES users(id), status TEXT NOT NULL DEFAULT 'Perencanaan', progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100), start_date TEXT NOT NULL, due_date TEXT NOT NULL, contract_amount INTEGER NOT NULL CHECK(contract_amount >= 0), budget_amount INTEGER NOT NULL CHECK(budget_amount >= 0));");
 db.exec("CREATE TABLE IF NOT EXISTS project_members (project_id INTEGER NOT NULL REFERENCES projects(id), user_id INTEGER NOT NULL REFERENCES users(id), PRIMARY KEY(project_id,user_id));");
 db.exec("CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), category TEXT NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), expense_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','CANCEL_PENDING','CANCELLED')), created_by INTEGER NOT NULL REFERENCES users(id), submitted_at TEXT, decided_by INTEGER REFERENCES users(id), decided_at TEXT, decision_reason TEXT, cancellation_reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
 db.exec("CREATE TABLE IF NOT EXISTS expense_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, expense_id INTEGER NOT NULL UNIQUE REFERENCES expenses(id), filename TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
 db.exec("CREATE TABLE IF NOT EXISTS expense_events (id INTEGER PRIMARY KEY AUTOINCREMENT, expense_id INTEGER NOT NULL REFERENCES expenses(id), actor_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
 db.exec("CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), expense_id INTEGER NOT NULL REFERENCES expenses(id), type TEXT NOT NULL, message TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
 db.exec("CREATE INDEX IF NOT EXISTS expenses_project_status ON expenses(project_id,status); CREATE INDEX IF NOT EXISTS notification_recipient ON notifications(user_id,read_at);");
 if (!db.prepare('SELECT 1 FROM projects LIMIT 1').get()) {
   const seed=[
    [1,'GCN-026','Instalasi Sistem Kontrol Gedung','PT Aruna Properti','Dimas Pratama','Berjalan',72,'2026-09-01','2026-11-15',850000000,620000000],
    [2,'GCN-025','Upgrade Panel Distribusi','PT Nusa Energi','Rina Putri','Berjalan',48,'2026-08-15','2026-11-05',540000000,390000000],
    [3,'GCN-024','Pemeliharaan Kelistrikan Pabrik','PT Sinar Industri','Yoga Saputra','Perencanaan',15,'2026-10-01','2026-12-20',325000000,240000000],
    [4,'GCN-023','Pemasangan CCTV & Access Control','PT Prima Logistik','Dimas Pratama','Selesai',100,'2026-06-01','2026-09-20',275000000,190000000]
   ];
   const insert=db.prepare('INSERT INTO projects(id,code,name,client,manager_name,status,progress,start_date,due_date,contract_amount,budget_amount) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
   db.transaction(()=>{for(const row of seed)insert.run(...row);})();
 }
 const isMember = db.prepare('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?');
 const getProject = db.prepare('SELECT * FROM projects WHERE id=?');
 function canRead(user, projectId) {
   const p=getProject.get(projectId);
   return !!p && (user.role==='admin' || p.manager_user_id===user.id || !!isMember.get(projectId,user.id));
 }
 function canReview(user, projectId) {
   const p=getProject.get(projectId);
   return !!p && user.role==='project_manager' && p.manager_user_id===user.id;
 }
 const usedStmt=db.prepare("SELECT COALESCE(SUM(amount),0) amount FROM expenses WHERE project_id=? AND status IN ('APPROVED','CANCEL_PENDING')");
 function projectRow(p){const used=usedStmt.get(p.id).amount;return {id:p.id,code:p.code,name:p.name,client:p.client,manager:p.manager_name,status:p.status,progress:p.progress,start:p.start_date,due:p.due_date,contract:p.contract_amount,budget:p.budget_amount,managerUserId:p.manager_user_id,approvedExpenses:used,remainingBudget:p.budget_amount-used};}
 function expenseRow(e){ const a=db.prepare('SELECT id,filename,mime,bytes FROM expense_receipts WHERE expense_id=?').get(e.id);return {id:e.id,projectId:e.project_id,category:e.category,description:e.description,amount:e.amount,date:e.expense_date,status:e.status,createdBy:e.created_by,submittedAt:e.submitted_at,decisionReason:e.decision_reason,cancellationReason:e.cancellation_reason,receipt:a||null}; }
 const insertEvent=db.prepare('INSERT INTO expense_events(expense_id,actor_id,action,from_status,to_status,reason) VALUES(?,?,?,?,?,?)');
 const notify=db.prepare('INSERT INTO notifications(user_id,expense_id,type,message) VALUES(?,?,?,?)');
 const singleExpense=db.prepare('SELECT * FROM expenses WHERE id=?');
 const validDate=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 function readError(req,res,expense) {return !expense?jsonError(res,404,'Transaksi tidak ditemukan.'):!canRead(req.session.user,expense.project_id)?jsonError(res,403,'Tidak berwenang mengakses transaksi ini.'):null;}
 app.get('/api/projects',requireAuth,(req,res)=>{
   const u=req.session.user;const all=db.prepare('SELECT * FROM projects ORDER BY id DESC').all();
   return res.json({projects:all.filter(p=>canRead(u,p.id)).map(projectRow)});
 });
 app.get('/api/project-managers',requireAuth,requireRole('admin'),(_req,res)=>res.json({users:db.prepare("SELECT id,full_name AS fullName FROM users WHERE role='project_manager' AND active=1 ORDER BY full_name").all()}));
 app.post('/api/projects',requireAuth,requireRole('admin'),(req,res)=>{
   const b=req.body||{}; const budget=moneyInt(b.budget,true),contract=moneyInt(b.contract,true);
   if(!b.name||!b.client||!validDate(b.start)||!validDate(b.due)||b.due<b.start||budget===null||contract===null) return jsonError(res,400,'Data proyek tidak valid.');
   const managerId=b.managerUserId===null||b.managerUserId===undefined?null:toId(b.managerUserId);
   const manager=managerId?db.prepare("SELECT id,full_name FROM users WHERE id=? AND role='project_manager' AND active=1").get(managerId):null;
   if(managerId&&!manager)return jsonError(res,400,'Project Manager tidak valid.');
   const id=Date.now(); const code='GCN-'+String(id).slice(-8);
   db.prepare('INSERT INTO projects(id,code,name,client,manager_name,manager_user_id,status,progress,start_date,due_date,contract_amount,budget_amount) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,code,String(b.name).trim().slice(0,150),String(b.client).trim().slice(0,150),manager?.full_name||'',manager?.id||null,'Perencanaan',0,b.start,b.due,contract,budget);
   res.status(201).json({project:projectRow(getProject.get(id))});
 });
 app.patch('/api/projects/:id/progress',requireAuth,(req,res)=>{
   const id=toId(req.params.id),p=getProject.get(id),n=Number(req.body.progress),u=req.session.user;
   if(!p)return jsonError(res,404,'Proyek tidak ditemukan.');
   if(!(u.role==='admin'||canReview(u,id)))return jsonError(res,403,'Tidak berwenang.');
   if(!Number.isInteger(n)||n<0||n>100)return jsonError(res,400,'Progres harus 0–100.');
   db.prepare('UPDATE projects SET progress=?,status=? WHERE id=?').run(n,n===100?'Selesai':n>0?'Berjalan':'Perencanaan',id);
   res.json({project:projectRow(getProject.get(id))});
 });
 app.delete('/api/projects/:id',requireAuth,requireRole('admin'),(req,res)=>{
   const id=toId(req.params.id);
   if(!getProject.get(id)) return jsonError(res,404,'Proyek tidak ditemukan.');
   if(db.prepare('SELECT 1 FROM expenses WHERE project_id=? LIMIT 1').get(id))return jsonError(res,409,'Proyek memiliki catatan biaya.');
   try{db.prepare('DELETE FROM projects WHERE id=?').run(id);res.json({ok:true});}
   catch(_e){return jsonError(res,409,'Proyek memiliki data terkait dan tidak dapat dihapus.');}
 });
 app.post('/api/projects/:id/assign-manager',requireAuth,requireRole('admin'),(req,res)=>{
   const id=toId(req.params.id),uid=toId(req.body.userId);
   const u=db.prepare("SELECT id,full_name FROM users WHERE id=? AND role='project_manager' AND active=1").get(uid);
   if(!getProject.get(id)||!u)return jsonError(res,400,'Proyek atau Project Manager tidak valid.');
   db.prepare('UPDATE projects SET manager_user_id=?,manager_name=? WHERE id=?').run(uid,u.full_name,id);
   res.json({project:projectRow(getProject.get(id))});
 });
 app.post('/api/projects/:id/assign-member',requireAuth,requireRole('admin'),(req,res)=>{
   const id=toId(req.params.id),uid=toId(req.body.userId);
   if(!getProject.get(id)||!db.prepare('SELECT 1 FROM users WHERE id=? AND active=1').get(uid))return jsonError(res,400,'Proyek atau pengguna tidak valid.');
   db.prepare('INSERT OR IGNORE INTO project_members(project_id,user_id) VALUES(?,?)').run(id,uid);
   res.json({ok:true});
 });
 app.get('/api/expenses',requireAuth,(req,res)=>{
   const rows=db.prepare('SELECT * FROM expenses ORDER BY id DESC').all();
   res.json({expenses:rows.filter(e=>canRead(req.session.user,e.project_id)).map(expenseRow)});
 });
 app.post('/api/expenses',requireAuth,(req,res)=>{
   const u=req.session.user,b=req.body||{},projectId=toId(b.projectId),amount=moneyInt(b.amount);
   if(!roleCanSubmit(u.role))return jsonError(res,403,'Role tidak berwenang mencatat biaya.');
   if(!canRead(u,projectId)||!CATEGORIES.has(b.category)||!validDate(b.date)||!String(b.description||'').trim()||amount===null)return jsonError(res,400,'Data pengeluaran tidak valid.');
   const result=db.transaction(()=>{
     const r=db.prepare('INSERT INTO expenses(project_id,category,description,amount,expense_date,created_by) VALUES(?,?,?,?,?,?)').run(projectId,b.category,String(b.description).trim().slice(0,1000),amount,b.date,u.id);
     insertEvent.run(r.lastInsertRowid,u.id,'CREATED',null,'DRAFT',null);return Number(r.lastInsertRowid);
   })();
   res.status(201).json({expense:expenseRow(singleExpense.get(result))});
 });
 app.patch('/api/expenses/:id',requireAuth,(req,res)=>{
   const e=singleExpense.get(toId(req.params.id)),u=req.session.user,b=req.body||{};
   const error=readError(req,res,e);if(error)return error;
   if(e.created_by!==u.id||!['DRAFT','REJECTED'].includes(e.status))return jsonError(res,409,'Hanya pengaju dapat mengubah draft atau pengajuan ditolak.');
   const amount=moneyInt(b.amount);
   if(!CATEGORIES.has(b.category)||!validDate(b.date)||!String(b.description||'').trim()||amount===null)return jsonError(res,400,'Data biaya tidak valid.');
   db.prepare("UPDATE expenses SET category=?,description=?,amount=?,expense_date=?,status='DRAFT' WHERE id=?").run(b.category,String(b.description).trim().slice(0,1000),amount,b.date,e.id);
   insertEvent.run(e.id,u.id,'EDITED',e.status,'DRAFT',null);
   res.json({expense:expenseRow(singleExpense.get(e.id))});
 });
 app.delete('/api/expenses/:id',requireAuth,(req,res)=>{
   const e=singleExpense.get(toId(req.params.id)),u=req.session.user;const error=readError(req,res,e);if(error)return error;
   if(e.created_by!==u.id||e.status!=='DRAFT')return jsonError(res,409,'Hanya draft milik sendiri yang dapat dihapus.');
   db.transaction(()=>{db.prepare('DELETE FROM expense_receipts WHERE expense_id=?').run(e.id);db.prepare('DELETE FROM expense_events WHERE expense_id=?').run(e.id);db.prepare('DELETE FROM expenses WHERE id=?').run(e.id);})();
   res.json({ok:true});
 });
 app.put('/api/expenses/:id/receipt',requireAuth,(req,res)=>{
   const e=singleExpense.get(toId(req.params.id)),u=req.session.user;const error=readError(req,res,e);if(error)return error;
   if(e.created_by!==u.id||!['DRAFT','REJECTED'].includes(e.status))return jsonError(res,409,'Lampiran hanya bisa diganti sebelum pengajuan.');
   const {filename,mime,base64}=req.body||{};
   if(typeof filename!=='string'||!filename.trim()||filename.length>180||/[\\/\x00-\x1f]/.test(filename)||typeof base64!=='string'||base64.length>7_100_000||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))return jsonError(res,400,'File atau nama file tidak valid.');
   const data=Buffer.from(base64,'base64');const type=validContent(data,mime);
   if(!type)return jsonError(res,400,'Lampiran harus PDF/JPG/PNG yang valid dan maksimal 5 MB.');
   const sha=crypto.createHash('sha256').update(data).digest('hex');
   db.prepare("INSERT INTO expense_receipts(expense_id,filename,mime,bytes,sha256,data) VALUES(?,?,?,?,?,?) ON CONFLICT(expense_id) DO UPDATE SET filename=excluded.filename,mime=excluded.mime,bytes=excluded.bytes,sha256=excluded.sha256,data=excluded.data,created_at=CURRENT_TIMESTAMP").run(e.id,filename.trim(),type,data.length,sha,data);
   res.json({expense:expenseRow(singleExpense.get(e.id))});
 });
 app.delete('/api/expenses/:id/receipt',requireAuth,(req,res)=>{
   const e=singleExpense.get(toId(req.params.id)),u=req.session.user;const error=readError(req,res,e);if(error)return error;
   if(e.created_by!==u.id||!['DRAFT','REJECTED'].includes(e.status))return jsonError(res,409,'Tidak dapat menghapus lampiran transaksi yang diajukan.');
   db.prepare('DELETE FROM expense_receipts WHERE expense_id=?').run(e.id);res.json({ok:true});
 });
 app.get('/api/expenses/:id/receipt',requireAuth,(req,res)=>{
   const e=singleExpense.get(toId(req.params.id));const error=readError(req,res,e);if(error)return error;
   const a=db.prepare('SELECT * FROM expense_receipts WHERE expense_id=?').get(e.id);
   if(!a)return jsonError(res,404,'Bukti belum tersedia.');
   res.set({'Content-Type':a.mime,'Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(a.filename),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});
   res.send(a.data);
 });
 app.post('/api/expenses/:id/submit',requireAuth,(req,res)=>{
   const id=toId(req.params.id),u=req.session.user;
   try {
     const row=db.transaction(()=>{
       const e=singleExpense.get(id);if(!e)throw new Error('NOT_FOUND');
       if(e.created_by!==u.id||!['DRAFT','REJECTED'].includes(e.status))throw new Error('INVALID_STATE');
       if(!canRead(u,e.project_id))throw new Error('FORBIDDEN');
       const p=getProject.get(e.project_id);
       if(!p.manager_user_id||p.manager_user_id===u.id)throw new Error('NO_REVIEWER');
       if(!db.prepare('SELECT 1 FROM expense_receipts WHERE expense_id=?').get(id))throw new Error('NO_RECEIPT');
       db.prepare("UPDATE expenses SET status='PENDING_APPROVAL',submitted_at=CURRENT_TIMESTAMP,decision_reason=NULL WHERE id=?").run(id);
       insertEvent.run(id,u.id,'SUBMITTED',e.status,'PENDING_APPROVAL',null);
       notify.run(p.manager_user_id,id,'EXPENSE_SUBMITTED','Ada biaya proyek yang memerlukan persetujuan.');
       return expenseRow(singleExpense.get(id));
     })();
     res.json({expense:row});
   }catch(err){return jsonError(res,err.message==='NO_RECEIPT'?400:err.message==='NO_REVIEWER'?409:err.message==='FORBIDDEN'?403:err.message==='NOT_FOUND'?404:409,({NO_RECEIPT:'Lampirkan bukti pengeluaran terlebih dahulu.',NO_REVIEWER:'Project Manager belum ditugaskan atau reviewer tidak independen.',INVALID_STATE:'Status pengeluaran tidak dapat diajukan.'})[err.message]||'Pengajuan tidak dapat diproses.');}
 });
 app.post('/api/expenses/:id/decision',requireAuth,requireRole('project_manager'),(req,res)=>{
   const id=toId(req.params.id),u=req.session.user,decision=req.body?.decision,reason=String(req.body?.reason||'').trim();
   if(!['approve','reject'].includes(decision)||decision==='reject'&&!reason)return jsonError(res,400,'Keputusan atau alasan penolakan tidak valid.');
   try{
     const row=db.transaction(()=>{
       const e=singleExpense.get(id);if(!e)throw new Error('NOT_FOUND');
       if(!canReview(u,e.project_id)||e.created_by===u.id)throw new Error('FORBIDDEN');
       if(e.status!=='PENDING_APPROVAL')throw new Error('INVALID_STATE');
       const p=getProject.get(e.project_id);
       if(decision==='approve'&&e.amount>p.budget_amount-usedStmt.get(p.id).amount)throw new Error('OVER_BUDGET');
       const status=decision==='approve'?'APPROVED':'REJECTED';
       db.prepare('UPDATE expenses SET status=?,decided_by=?,decided_at=CURRENT_TIMESTAMP,decision_reason=? WHERE id=?').run(status,u.id,reason||null,id);
       insertEvent.run(id,u.id,decision.toUpperCase(),'PENDING_APPROVAL',status,reason||null);
       notify.run(e.created_by,id,'EXPENSE_DECISION',status==='APPROVED'?'Pengeluaran telah disetujui.':'Pengeluaran ditolak.');
       return expenseRow(singleExpense.get(id));
     })();res.json({expense:row});
   }catch(err){return jsonError(res,err.message==='OVER_BUDGET'?409:err.message==='FORBIDDEN'?403:err.message==='NOT_FOUND'?404:409,({OVER_BUDGET:'Pengeluaran melebihi sisa anggaran proyek.',FORBIDDEN:'Tidak memiliki kewenangan untuk proyek ini.',INVALID_STATE:'Transaksi sudah diputuskan.'})[err.message]||'Keputusan gagal.');}
 });
 app.post('/api/expenses/:id/request-cancellation',requireAuth,(req,res)=>{
   const id=toId(req.params.id),u=req.session.user,reason=String(req.body?.reason||'').trim();
   if(!reason||reason.length>1000)return jsonError(res,400,'Alasan pembatalan wajib diisi.');
   try{
     const row=db.transaction(()=>{
       const e=singleExpense.get(id);if(!e)throw new Error('NOT_FOUND');
       if(e.created_by!==u.id||!canRead(u,e.project_id))throw new Error('FORBIDDEN');
       if(e.status!=='APPROVED')throw new Error('INVALID_STATE');
       const p=getProject.get(e.project_id);if(!p.manager_user_id)throw new Error('NO_REVIEWER');
       db.prepare("UPDATE expenses SET status='CANCEL_PENDING',cancellation_reason=? WHERE id=?").run(reason,id);
       insertEvent.run(id,u.id,'CANCELLATION_REQUESTED','APPROVED','CANCEL_PENDING',reason);
       notify.run(p.manager_user_id,id,'CANCELLATION_REQUEST','Permintaan pembatalan biaya membutuhkan persetujuan.');
       return expenseRow(singleExpense.get(id));
     })();res.json({expense:row});
   }catch(err){return jsonError(res,err.message==='FORBIDDEN'?403:409,'Pembatalan tidak dapat diajukan.');}
 });
 app.post('/api/expenses/:id/cancellation-decision',requireAuth,requireRole('project_manager'),(req,res)=>{
   const id=toId(req.params.id),u=req.session.user,decision=req.body?.decision,reason=String(req.body?.reason||'').trim();
   if(!['approve','reject'].includes(decision)||decision==='reject'&&!reason)return jsonError(res,400,'Keputusan atau alasan penolakan tidak valid.');
   try{
     const row=db.transaction(()=>{
       const e=singleExpense.get(id);if(!e)throw new Error('NOT_FOUND');
       if(!canReview(u,e.project_id)||e.created_by===u.id)throw new Error('FORBIDDEN');
       if(e.status!=='CANCEL_PENDING')throw new Error('INVALID_STATE');
       const status=decision==='approve'?'CANCELLED':'APPROVED';
       db.prepare('UPDATE expenses SET status=?,decided_by=?,decided_at=CURRENT_TIMESTAMP,decision_reason=? WHERE id=?').run(status,u.id,reason||null,id);
       insertEvent.run(id,u.id,'CANCELLATION_'+decision.toUpperCase(),'CANCEL_PENDING',status,reason||null);
       notify.run(e.created_by,id,'CANCELLATION_DECISION',status==='CANCELLED'?'Pembatalan biaya disetujui.':'Pembatalan biaya ditolak.');
       return expenseRow(singleExpense.get(id));
     })();res.json({expense:row});
   }catch(err){return jsonError(res,err.message==='FORBIDDEN'?403:409,'Keputusan pembatalan tidak dapat diproses.');}
 });
 app.get('/api/expenses/:id/history',requireAuth,(req,res)=>{
   const e=singleExpense.get(toId(req.params.id));const error=readError(req,res,e);if(error)return error;
   res.json({history:db.prepare('SELECT actor_id AS actorId,action,from_status AS fromStatus,to_status AS toStatus,reason,created_at AS createdAt FROM expense_events WHERE expense_id=? ORDER BY id').all(e.id)});
 });
 app.get('/api/notifications',requireAuth,(req,res)=>{
   const u=req.session.user;
   res.json({notifications:db.prepare('SELECT id,expense_id AS expenseId,type,message,read_at AS readAt,created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100').all(u.id)});
 });
 app.post('/api/notifications/:id/read',requireAuth,(req,res)=>{
   db.prepare('UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').run(toId(req.params.id),req.session.user.id);res.json({ok:true});
 });
}
module.exports={setupExpenseApi,validContent,MAX_FILE};
