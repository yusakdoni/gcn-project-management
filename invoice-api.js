'use strict';
// Invoice & payment monitoring for the student Capstone demo.
// These are customer invoices, not accounting/payroll functionality.
function setupInvoiceApi(app,db,requireAuth) {
 db.exec("CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY AUTOINCREMENT,project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,number TEXT NOT NULL UNIQUE COLLATE NOCASE,amount INTEGER NOT NULL CHECK(amount>0),due_date TEXT NOT NULL,created_by INTEGER REFERENCES users(id),is_sample INTEGER NOT NULL DEFAULT 0 CHECK(is_sample IN (0,1)),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
 db.exec("CREATE TABLE IF NOT EXISTS invoice_payments (id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,amount INTEGER NOT NULL CHECK(amount>0),paid_date TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
 db.exec("CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id)");
 // Preserve pre-existing demo presentation: only seed sample invoices on first, empty invoice database.
 if (!db.prepare('SELECT 1 FROM invoices LIMIT 1').get()) {
   const examples=[
     [1,1,'INV-GCN-001',250000000,'2026-11-10'],
     [2,2,'INV-GCN-002',160000000,'2026-10-25'],
     [3,4,'INV-GCN-003',80000000,'2026-09-25']
   ];
   const write=db.prepare('INSERT INTO invoices(id,project_id,number,amount,due_date,is_sample) VALUES(?,?,?,?,?,1)');
   const payment=db.prepare('INSERT INTO invoice_payments(invoice_id,amount,paid_date,note) VALUES(?,?,?,?)');
   db.transaction(()=>{
     for(const item of examples) {
       if(!db.prepare('SELECT 1 FROM projects WHERE id=?').get(item[1]))continue;
       write.run(...item);
       if(item[0]===1)payment.run(1,100000000,'2026-10-18','Pembayaran termin 1 (SIMULASI)');
       if(item[0]===3)payment.run(3,80000000,'2026-09-25','Lunas (SIMULASI)');
     }
   })();
 }
 const getProject=db.prepare('SELECT * FROM projects WHERE id=?');
 const member=db.prepare('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?');
 const canRead=(user,id)=> {
   const p=getProject.get(id);
   return !!p&&(user.role==='admin'||p.manager_user_id===user.id||!!member.get(id,user.id));
 };
 const canWrite=(user,id)=> ['admin','finance_staff'].includes(user.role)&&canRead(user,id);
 const invoice=db.prepare('SELECT * FROM invoices WHERE id=?');
 const payments=db.prepare('SELECT id,amount,paid_date AS date,note,created_at AS createdAt FROM invoice_payments WHERE invoice_id=? ORDER BY id');
 const totalPaid=db.prepare('SELECT COALESCE(SUM(amount),0) AS amount FROM invoice_payments WHERE invoice_id=?');
 const numberOK=v=>Number.isSafeInteger(v)&&v>0&&v<=9_000_000_000_000_000;
 const dateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const asId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
 const out=(record)=>{
   const p=getProject.get(record.project_id);
   return {id:record.id,projectId:record.project_id,number:record.number,client:p?.client||'',amount:record.amount,due:record.due_date,payments:payments.all(record.id),isSample:!!record.is_sample};
 };
 const error=(res,status,message)=>res.status(status).json({error:message});
 app.get('/api/invoices',requireAuth,(req,res)=>{
   const result=db.prepare('SELECT * FROM invoices ORDER BY id DESC').all().filter(i=>canRead(req.session.user,i.project_id)).map(out);
   res.json({invoices:result});
 });
 app.post('/api/invoices',requireAuth,(req,res)=>{
   const u=req.session.user,b=req.body||{},id=asId(b.projectId),amount=Number(b.amount);
   const number=typeof b.number==='string'?b.number.trim():'';
   if(!canWrite(u,id))return error(res,403,'Tidak memiliki izin mencatat invoice pada proyek.');
   if(!/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,59}$/.test(number)||!numberOK(amount)||!dateOK(b.due))return error(res,400,'Nomor invoice, nilai, atau tanggal tidak valid.');
   try{
     const result=db.prepare('INSERT INTO invoices(project_id,number,amount,due_date,created_by) VALUES(?,?,?,?,?)').run(id,number,amount,b.due,u.id);
     res.status(201).json({invoice:out(invoice.get(result.lastInsertRowid))});
   }catch(e){if(e.code?.startsWith('SQLITE_CONSTRAINT'))return error(res,409,'Nomor invoice sudah digunakan.');throw e;}
 });
 app.post('/api/invoices/:id/payments',requireAuth,(req,res)=>{
   const u=req.session.user,id=asId(req.params.id),b=req.body||{},amount=Number(b.amount);
   try{
     const result=db.transaction(()=>{
       const i=invoice.get(id);
       if(!i)throw new Error('NOT_FOUND');
       if(!canWrite(u,i.project_id))throw new Error('FORBIDDEN');
       if(!numberOK(amount)||!dateOK(b.date)||typeof b.note!=='string'||b.note.length>500)throw new Error('INVALID');
       if(totalPaid.get(id).amount+amount>i.amount)throw new Error('OVERPAYMENT');
       db.prepare('INSERT INTO invoice_payments(invoice_id,amount,paid_date,note,created_by) VALUES(?,?,?,?,?)').run(id,amount,b.date,b.note,u.id);
       return out(i);
     })();
     res.status(201).json({invoice:result});
   }catch(e){
     if(e.message==='NOT_FOUND')return error(res,404,'Invoice tidak ditemukan.');
     if(e.message==='FORBIDDEN')return error(res,403,'Tidak berwenang.');
     return error(res,e.message==='OVERPAYMENT'?409:400,e.message==='OVERPAYMENT'?'Pembayaran melebihi outstanding.':'Data pembayaran tidak valid.');
   }
 });
}
module.exports={setupInvoiceApi};
