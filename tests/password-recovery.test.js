import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setMailTransport } from "../mail.js";
let server,db,createUser,base,directory;
const messages=[];
const transport={async sendMail(message){messages.push(message);return {};}};
const oldPassword="OriginalStudent123!",newPassword="NewStudent123!";
before(async()=>{
 directory=await mkdtemp(path.join(tmpdir(),"retorno-reset-"));process.env.DATA_DIR=directory;process.env.NODE_ENV="test";
 ({server}=await import("../server.js"));({db,createUser}=await import("../db.js"));setMailTransport(transport);
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();await rm(directory,{recursive:true,force:true});});
async function request(route,data){const res=await fetch(base+"/api/"+route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});return{status:res.status,data:await res.json(),cookie:res.headers.get("set-cookie")};}
const forgot=email=>request("forgot-password",{email});
const code=email=>messages.filter(message=>message.to===email&&message.subject==="Reset your RETURNO password").at(-1).text.match(/code is (\d{6})/)[1];
const reset=(email,value=code(email),password=newPassword)=>request("reset-password",{email,code:value,password,confirmPassword:password});
test("only a verified single-use reset code changes a student password and revokes all sessions",async()=>{
 const email="recover@gmail.com",id=createUser(email,"Recovery Student",oldPassword);
 await request("login",{email,password:oldPassword,role:"student"});await request("login",{email,password:oldPassword,role:"student"});
 const before=db.prepare("SELECT password_hash FROM users WHERE id=?").get(id).password_hash;
 const sent=await forgot(email);assert.equal(sent.status,202);assert.equal(sent.cookie,null);
 const stored=db.prepare("SELECT * FROM password_resets WHERE user_id=?").get(id);
 assert.notEqual(stored.code_hash,code(email));assert.equal(JSON.stringify(sent.data).includes(code(email)),false);
 assert.equal((await reset(email,"000000")).status,400);
 assert.equal(db.prepare("SELECT password_hash FROM users WHERE id=?").get(id).password_hash,before);
 const oldCode=code(email),done=await reset(email);assert.equal(done.status,200);assert.equal(done.cookie,null);
 assert.equal(db.prepare("SELECT count(*) n FROM sessions WHERE user_id=?").get(id).n,0);
 assert.equal((await reset(email,oldCode)).status,400);
 assert.equal((await request("login",{email,password:oldPassword,role:"student"})).status,401);
 assert.equal((await request("login",{email,password:newPassword,role:"student"})).status,200);
 assert.ok(messages.some(message=>message.to===email&&message.subject==="Your RETURNO password was changed"&&!message.text.includes(newPassword)));
});
test("unknown, admin and student addresses receive the same request response; resend is throttled",async()=>{
 const email="cooldown@gmail.com";createUser(email,"Cooldown",oldPassword);createUser("admin@reset.example","Admin",oldPassword,"admin");
 const before=messages.length;
 const absent=await forgot("absent@gmail.com"),admin=await forgot("admin@reset.example");
 assert.deepEqual(absent,admin);assert.equal(messages.length,before);
 const student=await forgot(email);assert.deepEqual(student,absent);
 const count=messages.length;assert.deepEqual(await forgot(email),student);assert.equal(messages.length,count);
});
test("expired and exhausted codes fail without locking the student's login",async()=>{
 const email="limits@gmail.com",id=createUser(email,"Limits",oldPassword);await forgot(email);
 db.prepare("UPDATE password_resets SET expires_at=0 WHERE user_id=?").run(id);assert.equal((await reset(email)).status,400);
 await forgot(email);
 for(let i=0;i<5;i++)assert.equal((await reset(email,"000000")).status,400);
 assert.equal((await reset(email)).status,400);
 assert.equal((await request("login",{email,password:oldPassword,role:"student"})).status,200);
});
test("email failure keeps the original password and returns the generic response",async()=>{
 const email="mail-failure@gmail.com",id=createUser(email,"Mail failure",oldPassword);
 setMailTransport({async sendMail(){throw Error("SMTP test failure");}});
 try{assert.equal((await forgot(email)).status,202);assert.equal(db.prepare("SELECT * FROM password_resets WHERE user_id=?").get(id),undefined);assert.equal((await request("login",{email,password:oldPassword,role:"student"})).status,200);}finally{setMailTransport(transport);}
});
test("password updates and session revocation roll back together on failure",async()=>{
 const email="rollback@reset.example",id=createUser(email,"Rollback",oldPassword);await request("login",{email,password:oldPassword,role:"student"});await forgot(email);
 db.exec("CREATE TRIGGER reset_session_failure BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT,'reset failure'); END;");
 try{assert.equal((await reset(email)).status,500);assert.equal(db.prepare("SELECT count(*) n FROM sessions WHERE user_id=?").get(id).n,1);}finally{db.exec("DROP TRIGGER reset_session_failure");}
 assert.equal((await reset(email)).status,200);
});

test("a reset code cannot survive a password or role change, or account deletion",async()=>{
 const email="stale@reset.example",id=createUser(email,"Stale challenge",oldPassword);
 await forgot(email);
 db.prepare("UPDATE users SET password_hash=? WHERE id=?").run("changed-by-maintenance",id);
 assert.equal((await reset(email)).status,400);
 db.prepare("UPDATE password_resets SET sent_at=0 WHERE user_id=?").run(id);
 await forgot(email);
 db.prepare("UPDATE users SET role='admin' WHERE id=?").run(id);
 assert.equal((await reset(email)).status,400);
 db.prepare("DELETE FROM users WHERE id=?").run(id);
 assert.equal(db.prepare("SELECT * FROM password_resets WHERE user_id=?").get(id),undefined);
});
