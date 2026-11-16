import http from 'node:http';
import { DatabaseSync, backup } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { apply, initialState } from './src/core.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const data=process.env.POS_DATA_DIR || path.join(root,'data');
mkdirSync(data,{recursive:true});
const db=new DatabaseSync(path.join(data,'pos.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS store(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL)');
if(!db.prepare('SELECT id FROM store').get()) db.prepare('INSERT INTO store VALUES(1,?)').run(JSON.stringify(initialState()));
const getState=()=>JSON.parse(db.prepare('SELECT value FROM store WHERE id=1').get().value);
const users=()=>db.prepare('SELECT id,name,role FROM users').all();
const sessions=new Map(); let attempts=[];
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function addUser(name,pin,role){
 if(typeof pin!=='string'||!/^\d{6,12}$/.test(pin))fail('Use a PIN of 6–12 digits.');
 if(!name?.trim()||!['owner','cashier'].includes(role))fail('Name and valid role required.');
 const salt=randomBytes(16).toString('hex'),id=randomBytes(8).toString('hex');
 db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,name.trim(),role,salt,scryptSync(pin,salt,64).toString('hex')); return id;
}
const port=Number(process.env.PORT||3210), origin=`http://127.0.0.1:${port}`;
const server=http.createServer(async(req,res)=>{
 const send=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
 try{
  if(req.headers.host!==`127.0.0.1:${port}`)fail('Open the app using its 127.0.0.1 address.',403);
  if(req.headers.origin && req.headers.origin!==origin)fail('Cross-origin access denied.',403);
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const url=new URL(req.url,origin);
  if(!url.pathname.startsWith('/api/')){
   const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
   const name=files[url.pathname]; if(!name){res.writeHead(404);return res.end('Not found');}
   res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.setHeader('Cache-Control','no-cache');return res.end(readFileSync(path.join(root,'public',name)));
  }
  let body={}; if(req.method==='POST'){
   let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>1048576)fail('Request too large.',413);chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
  }
  if(url.pathname==='/api/status')return send(200,{setup:users().length===0,users:users()});
  if(req.method==='POST' && url.pathname==='/api/setup'){
   if(users().length)fail('Already configured.',409);addUser(body.name,body.pin,'owner');return send(200,{ok:true});
  }
  if(req.method==='POST' && url.pathname==='/api/login'){
   attempts=attempts.filter(t=>Date.now()-t<60000);if(attempts.length>=8)fail('Too many attempts. Wait one minute.',429);attempts.push(Date.now());
   const user=db.prepare('SELECT * FROM users WHERE id=?').get(String(body.id));
   if(!user||typeof body.pin!=='string'||body.pin.length>12||!timingSafeEqual(scryptSync(body.pin,user.salt,64),Buffer.from(user.hash,'hex')))fail('Incorrect PIN.',401);
   attempts=[];const token=randomBytes(32).toString('hex');sessions.set(token,{id:user.id,expires:Date.now()+8*3600000});
   res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return send(200,{ok:true});
  }
  const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8);
  const session=sessions.get(token),user=session&&session.expires>Date.now()?db.prepare('SELECT id,name,role FROM users WHERE id=?').get(session.id):null;
  if(!user)fail('Please sign in.',401);
  if(url.pathname==='/api/logout'){sessions.delete(token);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true});}
  if(url.pathname==='/api/state'){
   const state=getState();if(user.role!=='owner'){state.audit=[];state.orders=[];state.suppliers=[];state.movements=[];state.sales=state.sales.filter(s=>s.employeeId===user.id).map(s=>({...s,items:s.items.map(l=>({...l,cost:0}))}));state.shifts=state.shifts.filter(s=>s.employeeId===user.id);state.cash=state.cash.filter(c=>state.shifts.some(s=>s.id===c.shiftId));state.timecards=state.timecards.filter(t=>t.employeeId===user.id);state.products=state.products.map(p=>({...p,cost:0}));}
   return send(200,{state,user,users:users()});
  }
  if(url.pathname==='/api/backup' && req.method==='GET'){
   if(user.role!=='owner')fail('Owner access required.',403);
   const target=path.join(data,`snapshot-${randomBytes(8).toString('hex')}.backup`);
   try{await backup(db,target);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="counterpoint-backup.sqlite"','Cache-Control':'no-store'});res.end(readFileSync(target));}finally{if(existsSync(target))unlinkSync(target);}return;
  }
  if(req.method==='POST'&&url.pathname==='/api/users'){
   if(user.role!=='owner')fail('Owner access required.',403);addUser(body.name,body.pin,body.role);return send(200,{ok:true});
  }
  if(req.method==='POST'&&url.pathname==='/api/pin'){
   if(typeof body.pin!=='string'||!/^\d{6,12}$/.test(body.pin))fail('Use 6–12 digits.');
   const salt=randomBytes(16).toString('hex');db.prepare('UPDATE users SET salt=?,hash=? WHERE id=?').run(salt,scryptSync(body.pin,salt,64).toString('hex'),user.id);return send(200,{ok:true});
  }
  if(req.method==='POST'&&url.pathname==='/api/action'){
   db.exec('BEGIN IMMEDIATE');try{const state=getState();const result=apply(state,body,user);db.prepare('UPDATE store SET value=? WHERE id=1').run(JSON.stringify(state));db.exec('COMMIT');return send(200,{ok:true,result});}catch(e){db.exec('ROLLBACK');throw e;}
  }
  fail('Not found.',404);
 }catch(e){if(!res.headersSent)send(e.status||400,{error:e.message});else res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log(`Counterpoint POS: ${origin}\nLocal database: ${data}\nKeep this window open. Press Ctrl+C to stop.`));
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'The POS is already running, or this port is in use.':e.message);process.exit(1);});
