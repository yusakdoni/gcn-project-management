'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const net=require('node:net');
const {spawn}=require('node:child_process');
const Database=require('better-sqlite3');
const bcrypt=require('bcryptjs');
let dir,server,port,secret,db,admin,pm,otherPm,adminCookie,pmCookie,otherCookie;
async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});}
async function runServer() {
 port=await freePort();
 server=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),DATA_DIR:dir,SESSION_SECRET:secret,NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});
 let err='';server.stderr.on('data',d=>{err+=d.toString();});
 for(let i=0;i<100;i++){
   if(server.exitCode!==null)throw new Error('Server exited: '+err);
   try{const response=await fetch('http://127.0.0.1:'+port+'/health');if(response.ok)return;}catch(_e){}
   await new Promise(r=>setTimeout(r,70));
 }
 throw new Error('Server did not start: '+err);
}
async function stopServer() {
 if(!server||server.exitCode!==null)return;
 const child=server;
 await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},2500);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');});
}
async function request(route,method='GET',body,cookie){
 const headers={};if(cookie)headers.Cookie=cookie;if(method!=='GET')headers['X-GCN-Request']='1';
 if(body!==undefined)headers['Content-Type']='application/json';
 const response=await fetch('http://127.0.0.1:'+port+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const raw=await response.arrayBuffer();
 let data;
 try{data=JSON.parse(Buffer.from(raw).toString('utf8'));}catch(_e){data=Buffer.from(raw);}
 return {status:response.status,data,headers:response.headers};
}
async function login(email,password){
 const response=await request('/api/auth/login','POST',{email,password});
 assert.equal(response.status,200,JSON.stringify(response.data));
 return response.headers.get('set-cookie').split(';')[0];
}
test('Complete GCN Monitor receipt and approval lifecycle',async(t)=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'gcn-monitor-test-'));
 secret=crypto.randomBytes(48).toString('hex');
 t.after(async()=>{await stopServer();db?.close();fs.rmSync(dir,{recursive:true,force:true});});
 await runServer();
 db=new Database(path.join(dir,'gcn-monitor.sqlite'));db.pragma('foreign_keys=ON');
 function user(email,role) {
   const password=crypto.randomBytes(16).toString('hex');
   const result=db.prepare('INSERT INTO users(email,full_name,password_hash,role) VALUES(?,?,?,?)').run(email,email,bcrypt.hashSync(password,10),role);
   return {id:Number(result.lastInsertRowid),email,password};
 }
 admin=user('admin@example.test','admin');pm=user('pm@example.test','project_manager');otherPm=user('other@example.test','project_manager');
 adminCookie=await login(admin.email,admin.password);pmCookie=await login(pm.email,pm.password);otherCookie=await login(otherPm.email,otherPm.password);
 await t.test('Project assignment and record-level authorization',async()=>{
   const project=await request('/api/projects','GET',undefined,adminCookie);
   assert.equal(project.status,200);
   assert.ok(project.data.projects.some(p=>p.id===1));
   const set=await request('/api/projects/1/assign-manager','POST',{userId:pm.id},adminCookie);
   assert.equal(set.status,200);
   assert.equal(set.data.project.managerUserId,pm.id);
   const visible=await request('/api/projects','GET',undefined,pmCookie);
   assert.deepEqual(visible.data.projects.map(p=>p.id),[1]);
   const forbidden=await request('/api/projects','GET',undefined,otherCookie);
   assert.equal(forbidden.data.projects.length,0);
 });
 let expenseId;const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO//E8YAAAAASUVORK5CYII=','base64');
 await t.test('Draft and receipt upload validation',async()=>{
   const created=await request('/api/expenses','POST',{projectId:1,category:'Material',description:'Pembelian bahan simulasi',amount:10000000,date:'2026-11-12'},adminCookie);
   assert.equal(created.status,201,JSON.stringify(created.data));expenseId=created.data.expense.id;assert.equal(created.data.expense.status,'DRAFT');
   const premature=await request('/api/expenses/'+expenseId+'/submit','POST',{},adminCookie);assert.equal(premature.status,400);
   const wrong=await request('/api/expenses/'+expenseId+'/receipt','PUT',{filename:'bad.png',mime:'image/png',base64:Buffer.from('hello').toString('base64')},adminCookie);assert.equal(wrong.status,400);
   const oversized=await request('/api/expenses/'+expenseId+'/receipt','PUT',{filename:'large.png',mime:'image/png',base64:Buffer.concat([png,Buffer.alloc(5*1024*1024)]).toString('base64')},adminCookie);assert.equal(oversized.status,400);
   const attached=await request('/api/expenses/'+expenseId+'/receipt','PUT',{filename:'nota.png',mime:'image/png',base64:png.toString('base64')},adminCookie);
   assert.equal(attached.status,200,JSON.stringify(attached.data));assert.equal(attached.data.expense.receipt.filename,'nota.png');
   const receipt=await request('/api/expenses/'+expenseId+'/receipt','GET',undefined,adminCookie);
   assert.equal(receipt.status,200);assert.ok(Buffer.isBuffer(receipt.data));assert.deepEqual(receipt.data,png);
   const unauth=await request('/api/expenses/'+expenseId+'/receipt');assert.equal(unauth.status,401);
   const forbidden=await request('/api/expenses/'+expenseId+'/receipt','GET',undefined,otherCookie);assert.equal(forbidden.status,403);
 });
 await t.test('PDF/JPG attachments, replacement and draft deletion',async()=>{
   const created=await request('/api/expenses','POST',{projectId:1,category:'Material',description:'Lampiran percobaan',amount:12345,date:'2026-11-12'},adminCookie);
   assert.equal(created.status,201);const id=created.data.expense.id;
   const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
   const jpg=Buffer.from([255,216,255,224,1,2,3,255,217]);
   const uploaded=await request('/api/expenses/'+id+'/receipt','PUT',{filename:'nota.pdf',mime:'application/pdf',base64:pdf.toString('base64')},adminCookie);
   assert.equal(uploaded.status,200);assert.equal(uploaded.data.expense.receipt.mime,'application/pdf');
   const wrong=await request('/api/expenses/'+id+'/receipt','PUT',{filename:'salah.jpg',mime:'image/jpeg',base64:pdf.toString('base64')},adminCookie);
   assert.equal(wrong.status,400);
   const replaced=await request('/api/expenses/'+id+'/receipt','PUT',{filename:'foto.jpg',mime:'image/jpeg',base64:jpg.toString('base64')},adminCookie);
   assert.equal(replaced.status,200);assert.equal(replaced.data.expense.receipt.mime,'image/jpeg');
   const read=await request('/api/expenses/'+id+'/receipt','GET',undefined,adminCookie);
   assert.equal(read.status,200);assert.equal(read.headers.get('content-type'),'image/jpeg');
   const removed=await request('/api/expenses/'+id+'/receipt','DELETE',undefined,adminCookie);
   assert.equal(removed.status,200);
   const empty=await request('/api/expenses/'+id+'/receipt','GET',undefined,adminCookie);
   assert.equal(empty.status,404);
   const deleted=await request('/api/expenses/'+id,'DELETE',undefined,adminCookie);
   assert.equal(deleted.status,200);
 });
 await t.test('Over-budget expense approval is blocked',async()=>{
   const draft=await request('/api/expenses','POST',{projectId:1,category:'Material',description:'Melebihi anggaran',amount:620000001,date:'2026-11-12'},adminCookie);
   assert.equal(draft.status,201);const id=draft.data.expense.id;
   const pngData=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO//E8YAAAAASUVORK5CYII=','base64');
   assert.equal((await request('/api/expenses/'+id+'/receipt','PUT',{filename:'nota.png',mime:'image/png',base64:pngData.toString('base64')},adminCookie)).status,200);
   assert.equal((await request('/api/expenses/'+id+'/submit','POST',{},adminCookie)).status,200);
   const res=await request('/api/expenses/'+id+'/decision','POST',{decision:'approve'},pmCookie);
   assert.equal(res.status,409);
 });
 await t.test('Submit, notify, approve and prevent double budget impact',async()=>{
   const before=await request('/api/projects','GET',undefined,adminCookie);
   const remaining=before.data.projects.find(p=>p.id===1).remainingBudget;
   const submitted=await request('/api/expenses/'+expenseId+'/submit','POST',{},adminCookie);
   assert.equal(submitted.status,200);assert.equal(submitted.data.expense.status,'PENDING_APPROVAL');
   const inProgress=await request('/api/projects','GET',undefined,adminCookie);
   assert.equal(inProgress.data.projects.find(p=>p.id===1).remainingBudget,remaining);
   const notes=await request('/api/notifications','GET',undefined,pmCookie);
   assert.ok(notes.data.notifications.some(n=>n.expenseId===expenseId));
   const forbidden=await request('/api/expenses/'+expenseId+'/decision','POST',{decision:'approve'},otherCookie);assert.equal(forbidden.status,403);
   const concurrent=await Promise.all([request('/api/expenses/'+expenseId+'/decision','POST',{decision:'approve'},pmCookie),request('/api/expenses/'+expenseId+'/decision','POST',{decision:'approve'},pmCookie)]);
   assert.deepEqual(concurrent.map(r=>r.status).sort((a,b)=>a-b),[200,409]);
   const approved=concurrent.find(r=>r.status===200);assert.equal(approved.data.expense.status,'APPROVED');
   const again=await request('/api/expenses/'+expenseId+'/decision','POST',{decision:'approve'},pmCookie);assert.equal(again.status,409);
   const after=await request('/api/projects','GET',undefined,adminCookie);
   assert.equal(after.data.projects.find(p=>p.id===1).remainingBudget,remaining-10000000);
 });
 await t.test('Cancellation needs approval, preserves evidence and restores budget exactly once',async()=>{
   const before=await request('/api/projects','GET',undefined,adminCookie);
   const remaining=before.data.projects.find(p=>p.id===1).remainingBudget;
   const pending=await request('/api/expenses/'+expenseId+'/request-cancellation','POST',{reason:'Nota pengeluaran perlu dibatalkan'},adminCookie);
   assert.equal(pending.status,200);assert.equal(pending.data.expense.status,'CANCEL_PENDING');
   const during=await request('/api/projects','GET',undefined,adminCookie);
   assert.equal(during.data.projects.find(p=>p.id===1).remainingBudget,remaining);
   const decision=await request('/api/expenses/'+expenseId+'/cancellation-decision','POST',{decision:'approve'},pmCookie);
   assert.equal(decision.status,200);assert.equal(decision.data.expense.status,'CANCELLED');
   const repeated=await request('/api/expenses/'+expenseId+'/cancellation-decision','POST',{decision:'approve'},pmCookie);assert.equal(repeated.status,409);
   const after=await request('/api/projects','GET',undefined,adminCookie);
   assert.equal(after.data.projects.find(p=>p.id===1).remainingBudget,remaining+10000000);
   const receipt=await request('/api/expenses/'+expenseId+'/receipt','GET',undefined,pmCookie);assert.equal(receipt.status,200);
   const history=await request('/api/expenses/'+expenseId+'/history','GET',undefined,pmCookie);
   assert.ok(history.data.history.some(h=>h.action==='CANCELLATION_APPROVE'));
 });
 await t.test('Rejected expenses never affect remaining budget',async()=>{
   const before=await request('/api/projects','GET',undefined,adminCookie);
   const remaining=before.data.projects.find(p=>p.id===1).remainingBudget;
   const c=await request('/api/expenses','POST',{projectId:1,category:'Jasa',description:'Jasa simulasi',amount:25000,date:'2026-11-12'},adminCookie);
   assert.equal(c.status,201);const id=c.data.expense.id;
   const uploaded=await request('/api/expenses/'+id+'/receipt','PUT',{filename:'receipt.png',mime:'image/png',base64:png.toString('base64')},adminCookie);assert.equal(uploaded.status,200);
   assert.equal((await request('/api/expenses/'+id+'/submit','POST',{},adminCookie)).status,200);
   const rejected=await request('/api/expenses/'+id+'/decision','POST',{decision:'reject',reason:'Bukti kurang jelas'},pmCookie);
   assert.equal(rejected.status,200);assert.equal(rejected.data.expense.status,'REJECTED');
   const after=await request('/api/projects','GET',undefined,adminCookie);
   assert.equal(after.data.projects.find(p=>p.id===1).remainingBudget,remaining);
 });
 await t.test('Private database and persistence after restart',async()=>{
   const privateData=await request('/data/gcn-monitor.sqlite','GET',undefined,adminCookie);assert.equal(privateData.status,404);
   const privateSource=await request('/expense-api.js','GET',undefined,adminCookie);assert.equal(privateSource.status,404);
   await stopServer();db.close();db=null;
   await runServer();
   const res=await request('/api/expenses/'+expenseId+'/receipt','GET',undefined,adminCookie);
   assert.equal(res.status,200);
   const p=await request('/api/projects','GET',undefined,pmCookie);assert.equal(p.status,200);
   assert.ok(p.data.projects.some(x=>x.id===1));
 });
});
