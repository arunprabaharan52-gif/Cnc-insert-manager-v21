
require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const cron = require('node-cron');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-now',
  resave:false, saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:8*60*60*1000}
}));

const db = new Database(path.join(__dirname,'data','app.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS employees(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 phone TEXT NOT NULL UNIQUE,
 employee_code TEXT UNIQUE,
 active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS logs(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 log_date TEXT NOT NULL,
 employee_name TEXT NOT NULL,
 employee_phone TEXT NOT NULL,
 employee_code TEXT,
 shift TEXT,
 machine TEXT,
 job_name TEXT,
 cycle_time REAL DEFAULT 0,
 shift_hours REAL DEFAULT 7,
 actual_jobs INTEGER DEFAULT 0,
 company TEXT,
 inserts_json TEXT DEFAULT '[]',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
try{db.exec(`ALTER TABLE employees ADD COLUMN employee_code TEXT UNIQUE`)}catch(e){}
try{db.exec(`ALTER TABLE logs ADD COLUMN employee_code TEXT`)}catch(e){}

function today(){
  const d=new Date();
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function targetJobs(row){
  const c=Number(row.cycle_time||0), h=Number(row.shift_hours||0);
  return c>0 ? (60/c)*h : 0;
}
function pct(actual,target){ return target>0 ? actual/target*100 : 0; }

function adminRequired(req,res,next){
  if(req.session && req.session.admin) return next();
  res.status(401).json({error:'Admin login required'});
}
function verifyAdmin(user,pass){
  return user===(process.env.ADMIN_USERNAME||'admin') && pass===(process.env.ADMIN_PASSWORD||'CHANGE_THIS_PASSWORD');
}

app.use(express.static(path.join(__dirname,'public'), {index:false}));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.post('/api/admin/login',(req,res)=>{
  const {username,password}=req.body||{};
  if(verifyAdmin(username,password)){req.session.admin=true;return res.json({ok:true})}
  res.status(401).json({error:'Invalid login'});
});
app.post('/api/admin/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/admin/session',(req,res)=>res.json({admin:!!req.session?.admin}));

app.get('/api/health',(req,res)=>res.json({ok:true,time:new Date().toISOString()}));

app.get('/api/employees',adminRequired,(req,res)=>{
  res.json(db.prepare('SELECT * FROM employees WHERE active=1 ORDER BY name').all());
});
app.post('/api/employees',adminRequired,(req,res)=>{
  const {name,phone,employee_code}=req.body||{};
  if(!name||!phone||!employee_code) return res.status(400).json({error:'name, phone, employee_code required'});
  try{
    const info=db.prepare('INSERT INTO employees(name,phone,employee_code) VALUES(?,?,?)')
      .run(String(name).trim(),String(phone).replace(/\D/g,''),String(employee_code).trim());
    res.json({ok:true,id:info.lastInsertRowid});
  }catch(e){res.status(400).json({error:e.message})}
});

app.post('/api/logs',(req,res)=>{
  const b=req.body||{};
  const required=['log_date','employee_code','machine'];
  for(const k of required) if(!b[k]) return res.status(400).json({error:`${k} required`});
  const emp=db.prepare('SELECT * FROM employees WHERE employee_code=? AND active=1').get(String(b.employee_code).trim());
  if(!emp) return res.status(403).json({error:'Invalid employee code'});
  const inserts=Array.isArray(b.inserts)?b.inserts.filter(x=>x.code&&(Number(x.qty)||Number(x.jobs))):[];
  db.prepare(`INSERT INTO logs
   (log_date,employee_name,employee_phone,employee_code,shift,machine,job_name,cycle_time,shift_hours,actual_jobs,company,inserts_json)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
   .run(b.log_date,emp.name,emp.phone,emp.employee_code,b.shift||'',b.machine,b.job_name||'',
        Number(b.cycle_time)||0,Number(b.shift_hours)||7,Number(b.actual_jobs)||0,b.company||'',JSON.stringify(inserts));
  res.json({ok:true,employee_name:emp.name});
});

app.get('/api/logs',adminRequired,(req,res)=>{
  const date=req.query.date||today();
  const rows=db.prepare('SELECT * FROM logs WHERE log_date=? ORDER BY created_at DESC').all(date);
  rows.forEach(r=>{try{r.inserts=JSON.parse(r.inserts_json||'[]')}catch{r.inserts=[]}});
  res.json(rows);
});

app.get('/api/dashboard',adminRequired,(req,res)=>{
  const date=req.query.date||today();
  const rows=db.prepare('SELECT * FROM logs WHERE log_date=?').all(date);
  const shifts={}, employees={};
  for(const r of rows){
    const target=targetJobs(r), actual=Number(r.actual_jobs||0);
    const s=(r.shift||'OTHER').toUpperCase();
    if(!shifts[s]) shifts[s]={shift:s,target:0,actual:0,employees:new Set()};
    shifts[s].target+=target; shifts[s].actual+=actual; shifts[s].employees.add(r.employee_name);
    const k=r.employee_code||r.employee_phone||r.employee_name;
    if(!employees[k]) employees[k]={name:r.employee_name,code:r.employee_code,phone:r.employee_phone,target:0,actual:0,shift:r.shift,machines:new Set(),jobs:new Set()};
    employees[k].target+=target; employees[k].actual+=actual;
    if(r.machine)employees[k].machines.add(r.machine);
    if(r.job_name)employees[k].jobs.add(r.job_name);
  }
  res.json({
    date,total_logs:rows.length,
    shifts:Object.values(shifts).map(s=>({shift:s.shift,target:s.target,actual:s.actual,pct:pct(s.actual,s.target),employees:s.employees.size})),
    employees:Object.values(employees).map(e=>({name:e.name,code:e.code,phone:e.phone,target:e.target,actual:e.actual,pct:pct(e.actual,e.target),shift:e.shift,machines:[...e.machines],jobs:[...e.jobs]}))
  });
});

async function sendWhatsAppTemplate(to, templateName, bodyParams=[]){
  const token=process.env.WHATSAPP_TOKEN, phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version=process.env.WHATSAPP_API_VERSION||'v23.0';
  if(!token||!phoneId||!templateName) return {skipped:true,reason:'WhatsApp env not configured'};
  const components=bodyParams.length?[{type:'body',parameters:bodyParams.map(x=>({type:'text',text:String(x)}))}]:[];
  const response=await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{
    method:'POST',
    headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',to:String(to).replace(/\D/g,''),type:'template',
      template:{name:templateName,language:{code:'en'},components}})
  });
  const data=await response.json();
  if(!response.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function runMissingReminder(){
  const d=today();
  const employees=db.prepare('SELECT * FROM employees WHERE active=1').all();
  const logged=new Set(db.prepare('SELECT DISTINCT employee_code FROM logs WHERE log_date=?').all(d).map(x=>x.employee_code));
  const missing=employees.filter(e=>!logged.has(e.employee_code));
  for(const e of missing){
    try{await sendWhatsAppTemplate(e.phone,process.env.REMINDER_TEMPLATE,[e.name,d])}catch(err){console.error(err.message)}
  }
  if(missing.length && process.env.ADMIN_PHONE){
    try{await sendWhatsAppTemplate(process.env.ADMIN_PHONE,process.env.ADMIN_MISSING_TEMPLATE,[d,missing.map(x=>x.name).join(', '),String(missing.length)])}
    catch(err){console.error(err.message)}
  }
  return missing;
}
async function runDailySummary(){
  const d=today(), rows=db.prepare('SELECT * FROM logs WHERE log_date=?').all(d);
  let target=0,actual=0; const shifts={};
  for(const r of rows){
    const t=targetJobs(r),a=Number(r.actual_jobs||0); target+=t;actual+=a;
    const s=(r.shift||'OTHER').toUpperCase(); if(!shifts[s])shifts[s]={t:0,a:0}; shifts[s].t+=t; shifts[s].a+=a;
  }
  const shiftText=Object.entries(shifts).map(([s,v])=>`${s}: ${pct(v.a,v.t).toFixed(1)}%`).join(' | ')||'No shift data';
  if(process.env.ADMIN_PHONE) return sendWhatsAppTemplate(process.env.ADMIN_PHONE,process.env.DAILY_SUMMARY_TEMPLATE,[d,String(rows.length),pct(actual,target).toFixed(1),shiftText]);
}

app.post('/api/admin/test-reminders',adminRequired,async(req,res)=>{try{res.json({ok:true,missing:await runMissingReminder()})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/admin/test-summary',adminRequired,async(req,res)=>{try{res.json({ok:true,result:await runDailySummary()})}catch(e){res.status(500).json({error:e.message})}});

const rh=Number(process.env.REMINDER_HOUR||18), rm=Number(process.env.REMINDER_MINUTE||0);
const dh=Number(process.env.DAILY_SUMMARY_HOUR||20), dm=Number(process.env.DAILY_SUMMARY_MINUTE||0);
cron.schedule(`${rm} ${rh} * * *`,()=>runMissingReminder().catch(console.error));
cron.schedule(`${dm} ${dh} * * *`,()=>runDailySummary().catch(console.error));

const port=process.env.PORT||3000;
app.listen(port,()=>console.log(`Pro V20 running on http://localhost:${port}`));
