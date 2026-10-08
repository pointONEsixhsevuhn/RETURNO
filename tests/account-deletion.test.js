import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
let server, db, createUser, base, directory, adminId, studentId, adminCookie, studentCookie;
before(async () => {
 directory = await mkdtemp(path.join(tmpdir(), "retorno-delete-user-"));
 process.env.DATA_DIR=directory; process.env.NODE_ENV="test";
 ({ server } = await import("../server.js"));
 ({ db, createUser } = await import("../db.js"));
 adminId=createUser("actor@delete.example", "Actor Admin", "DeleteAdmin123!", "admin");
 studentId=createUser("actor-student@delete.example", "Actor Student", "DeleteStudent123!");
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 base=`http://127.0.0.1:${server.address().port}`;
 adminCookie=(await request("/api/login","POST",{email:"actor@delete.example",password:"DeleteAdmin123!",role:"admin"})).cookie;
 studentCookie=(await request("/api/login","POST",{email:"actor-student@delete.example",password:"DeleteStudent123!",role:"student"})).cookie;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();await rm(directory,{recursive:true,force:true});});
async function request(route,method="GET",data,cookie){
 const res=await fetch(base+route,{method,headers:{"content-type":"application/json",...(cookie?{cookie}: {})},body:data===undefined?undefined:JSON.stringify(data)});
 return {status:res.status,data:await res.json(),cookie:res.headers.get("set-cookie")?.split(";")[0]};
}
test("account deletion is admin-only and denies students before revealing target existence",async()=>{
 for(const id of [studentId,"missing-account"]) {
  assert.equal((await request("/api/users/"+id,"DELETE",{confirmEmail:"actor-student@delete.example"},studentCookie)).status,403);
  assert.equal((await request("/api/users/"+id,"DELETE",{confirmEmail:"actor-student@delete.example"})).status,401);
 }
 assert.ok(db.prepare("SELECT id FROM users WHERE id=?").get(studentId));
});
test("admins cannot delete themselves and must confirm the exact target email",async()=>{
 assert.equal((await request("/api/users/"+adminId,"DELETE",{confirmEmail:"actor@delete.example"},adminCookie)).status,409);
 assert.equal((await request("/api/users/"+studentId,"DELETE",{confirmEmail:"wrong@delete.example"},adminCookie)).status,400);
 assert.equal((await request("/api/users/missing-account","DELETE",{confirmEmail:"wrong@delete.example"},adminCookie)).status,404);
 assert.ok(db.prepare("SELECT id FROM users WHERE id=?").get(adminId));
 assert.ok(db.prepare("SELECT id FROM users WHERE id=?").get(studentId));
});
test("deleting a student atomically removes all reports and sessions but preserves other accounts",async()=>{
 const targetId=createUser("target@delete.example","Target Student","TargetStudent123!");
 const login=await request("/api/login","POST",{email:"target@delete.example",password:"TargetStudent123!",role:"student"});
 await request("/api/login","POST",{email:"target@delete.example",password:"TargetStudent123!",role:"student"});
 const post=await request("/api/posts","POST",{kind:"Lost",item_name:"Delete test report",event_at:"2026-10-08T12:00",location:"Library",description:"Target report"},login.cookie);
 assert.equal(post.status,201);
 assert.equal(db.prepare("SELECT count(*) n FROM sessions WHERE user_id=?").get(targetId).n,2);
 assert.equal((await request("/api/users/"+targetId,"DELETE",{confirmEmail:"TARGET@DELETE.EXAMPLE"},adminCookie)).status,200);
 assert.equal(db.prepare("SELECT id FROM users WHERE id=?").get(targetId),undefined);
 assert.equal(db.prepare("SELECT count(*) n FROM posts WHERE user_id=?").get(targetId).n,0);
 assert.equal(db.prepare("SELECT count(*) n FROM sessions WHERE user_id=?").get(targetId).n,0);
 assert.equal((await request("/api/me","GET",undefined,login.cookie)).status,401);
 assert.equal((await request("/api/login","POST",{email:"target@delete.example",password:"TargetStudent123!",role:"student"})).status,401);
 assert.equal((await request("/api/me","GET",undefined,studentCookie)).status,200);
 assert.equal((await request("/api/me","GET",undefined,adminCookie)).status,200);
});
test("an administrator can delete another administrator without losing their own access",async()=>{
 const id=createUser("peer@delete.example","Peer Admin","PeerAdmin123!","admin");
 assert.equal((await request("/api/users/"+id,"DELETE",{confirmEmail:"peer@delete.example"},adminCookie)).status,200);
 assert.equal((await request("/api/users","GET",undefined,adminCookie)).status,200);
});

test("a cascade failure rolls back the account, reports and sessions together",async()=>{
 const id=createUser("rollback@delete.example","Rollback Student","RollbackStudent123!");
 const login=await request("/api/login","POST",{email:"rollback@delete.example",password:"RollbackStudent123!",role:"student"});
 const post=await request("/api/posts","POST",{kind:"Found",item_name:"Preserve on failure",event_at:"2026-10-08T12:00",location:"Gate",description:"Rollback"},login.cookie);
 assert.equal(post.status,201);
 db.exec("CREATE TRIGGER deletion_test_failure BEFORE DELETE ON posts BEGIN SELECT RAISE(ABORT,'cascade failure test'); END;");
 try {
  assert.equal((await request("/api/users/"+id,"DELETE",{confirmEmail:"rollback@delete.example"},adminCookie)).status,500);
  assert.ok(db.prepare("SELECT id FROM users WHERE id=?").get(id));
  assert.ok(db.prepare("SELECT id FROM posts WHERE id=?").get(post.data.post.id));
  assert.equal((await request("/api/me","GET",undefined,login.cookie)).status,200);
 } finally { db.exec("DROP TRIGGER deletion_test_failure"); }
});
