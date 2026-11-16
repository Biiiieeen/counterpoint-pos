import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
test('HTTP authentication, origin guard, transaction rollback, backup and restart persistence',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'counterpoint-test-')),port=33219,base=`http://127.0.0.1:${port}`;let child;
 async function start(){child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),POS_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('exit',()=>reject(new Error('Server exited')));child.stderr.on('data',()=>{});});}
 async function stop(){if(child?.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}}
 let cookie='';async function req(route,body,headers={}){return fetch(base+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...headers},body:body===undefined?undefined:JSON.stringify(body)});}
 try{await start();assert.equal((await req('state')).status,401);assert.equal((await req('setup',{name:'Owner',pin:'123456'},{Origin:'https://evil.example'})).status,403);assert.equal((await req('setup',{name:'Owner',pin:'123456'})).status,200);const status=await (await req('status')).json();const login=await req('login',{id:status.users[0].id,pin:'123456'});cookie=login.headers.get('set-cookie').split(';')[0];assert.equal(login.status,200);
 await req('action',{type:'demo'});await req('action',{type:'openShift',opening:100});let data=await (await req('state')).json();const p=data.state.products[0];await req('action',{type:'sale',items:[{id:p.id,qty:1}],payment:'Cash',tendered:500});
 const count=data.state.sales.length+1;const bad=await req('action',{type:'sale',items:[{id:p.id,qty:1},{id:p.id,qty:1}],payment:'Cash',tendered:1000});assert.equal(bad.status,400);data=await (await req('state')).json();assert.equal(data.state.sales.length,count);assert.equal(data.state.products[0].stock,99);
 await req('users',{name:'Cashier',pin:'654321',role:'cashier'});const statuses=await (await req('status')).json();const cashierLogin=await req('login',{id:statuses.users[1].id,pin:'654321'});const ownerCookie=cookie;cookie=cashierLogin.headers.get('set-cookie').split(';')[0];assert.equal((await req('backup')).status,403);assert.equal((await req('action',{type:'demo'})).status,400);cookie=ownerCookie;
 const back=await req('backup');assert.equal(back.status,200);const f=path.join(dir,'test.backup');writeFileSync(f,Buffer.from(await back.arrayBuffer()));const copy=new DatabaseSync(f);assert.equal(JSON.parse(copy.prepare('SELECT value FROM store').get().value).sales.length,count);copy.close();
 await stop();await start();cookie='';const relog=await req('login',{id:status.users[0].id,pin:'123456'});cookie=relog.headers.get('set-cookie').split(';')[0];assert.equal((await (await req('state')).json()).state.sales.length,count);
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
