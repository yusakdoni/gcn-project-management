'use strict';
const express = require('express');

function businessRouter(db, requireAuth) {
 const router = express.Router();
 router.use(requireAuth);
 const fail = (res, status, error) => res.status(status).json({ error });
 const allowed = (user, projectId) => user.role === 'admin' ||
   !!db.prepare('SELECT 1 FROM project_assignments WHERE project_id=? AND user_id=?').get(projectId, user.id);
 const validAmount = value => Number.isSafeInteger(value) && value >= 0;
 const fields = 'id,code,name,client,manager,status,progress,start_date AS start,due_date AS due,contract_amount AS contract,budget_amount AS budget,created_at AS createdAt';
 const budget = db.prepare(`SELECT p.budget_amount AS budget, COALESCE(SUM(CASE WHEN e.status IN ('APPROVED','CANCEL_PENDING') THEN e.amount ELSE 0 END),0) AS committed
 FROM projects p LEFT JOIN expenses e ON e.project_id=p.id WHERE p.id=? GROUP BY p.id`);
 router.get('/projects', (req,res) => {
  const rows = req.session.user.role === 'admin'
   ? db.prepare(`SELECT ${fields} FROM projects ORDER BY id DESC`).all()
   : db.prepare(`SELECT ${fields} FROM projects WHERE id IN (SELECT project_id FROM project_assignments WHERE user_id=?) ORDER BY id DESC`).all(req.session.user.id);
  res.json({ projects: rows.map(p => { const b=budget.get(p.id); return {...p,remainingBudget:b.budget-b.committed}; }) });
 });
 router.post('/projects', (req,res) => {
  if(req.session.user.role !== 'admin') return fail(res,403,'Hanya admin dapat membuat proyek.');
  const {code,name,client='',manager='',status='Perencanaan',progress=0,start=null,due=null,contract=0,budget:limit=0}=req.body;
  if(typeof code!=='string'||!code.trim()||typeof name!=='string'||!name.trim()||!validAmount(contract)||!validAmount(limit)||!Number.isInteger(progress)||progress<0||progress>100) return fail(res,400,'Data proyek tidak valid.');
  try {
   const r=db.prepare('INSERT INTO projects(code,name,client,manager,status,progress,start_date,due_date,contract_amount,budget_amount,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(code.trim(),name.trim(),String(client),String(manager),String(status),progress,start,due,contract,limit,req.session.user.id);
   res.status(201).json({id:r.lastInsertRowid});
  } catch(e) { if(e.code?.startsWith('SQLITE_CONSTRAINT')) return fail(res,409,'Kode proyek sudah ada atau data tidak valid.'); throw e; }
 });
 router.post('/projects/:id/assignments', (req,res) => {
  if(req.session.user.role!=='admin') return fail(res,403,'Hanya admin dapat menetapkan PIC.');
  const id=Number(req.params.id), uid=req.body.userId, role=req.body.assignmentRole;
  if(!Number.isSafeInteger(id)||!Number.isSafeInteger(uid)||!['pic','member'].includes(role)) return fail(res,400,'Assignment tidak valid.');
  const user=db.prepare('SELECT role,active FROM users WHERE id=?').get(uid);
  if(!user||!user.active|| (role==='pic'&&user.role!=='project_manager')) return fail(res,400,'Pengguna tidak aktif atau bukan project manager.');
  try { db.prepare('INSERT INTO project_assignments(project_id,user_id,assignment_role) VALUES(?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET assignment_role=excluded.assignment_role').run(id,uid,role);res.status(201).json({ok:true}); }
  catch(e){if(e.code?.startsWith('SQLITE_CONSTRAINT')) return fail(res,404,'Proyek tidak ditemukan.');throw e;}
 });
 router.get('/projects/:id/expenses', (req,res) => {
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||!allowed(req.session.user,id)) return fail(res,403,'Akses proyek ditolak.');
  const expenses=db.prepare('SELECT id,project_id AS projectId,category,description,amount,expense_date AS date,status,created_by AS createdBy,created_at AS createdAt FROM expenses WHERE project_id=? ORDER BY id DESC').all(id);
  const b=budget.get(id);
  if(!b) return fail(res,404,'Proyek tidak ditemukan.');
  res.json({expenses,budget:b.budget,committed:b.committed,remainingBudget:b.budget-b.committed});
 });
 router.post('/projects/:id/expenses', (req,res) => {
  const id=Number(req.params.id),u=req.session.user;
  if(!Number.isSafeInteger(id)||!allowed(u,id)) return fail(res,403,'Akses proyek ditolak.');
  if(!['admin','project_staff','finance_staff'].includes(u.role)) return fail(res,403,'Peran tidak dapat mengajukan biaya.');
  const {category,description,amount,date}=req.body;
  if(typeof category!=='string'||!category.trim()||typeof description!=='string'||!description.trim()||!Number.isSafeInteger(amount)||amount<=0||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res,400,'Data biaya tidak valid.');
  try {
   const r=db.transaction(()=>{
    const inserted=db.prepare('INSERT INTO expenses(project_id,category,description,amount,expense_date,created_by) VALUES(?,?,?,?,?,?)').run(id,category.trim(),description.trim(),amount,date,u.id);
    db.prepare('INSERT INTO expense_audit_logs(expense_id,actor_id,action) VALUES(?,?,?)').run(inserted.lastInsertRowid,u.id,'CREATE_DRAFT');
    return inserted.lastInsertRowid;
   })();
   res.status(201).json({id:r,status:'DRAFT'});
  }catch(e){if(e.code?.startsWith('SQLITE_CONSTRAINT'))return fail(res,404,'Proyek tidak ditemukan.');throw e;}
 });
 return router;
}
module.exports = { businessRouter };
