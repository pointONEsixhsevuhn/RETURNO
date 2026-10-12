import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { test, expect } from "./fixtures.js";

// Layout audit uses only this worker's temporary database and captured mail.
test("all page layouts fit six widths and short landscape screens", async ({page}, info) => {
 test.skip(info.project.name !== "desktop-chromium", "This audit explicitly sets its own viewport matrix.");
 test.setTimeout(120_000);
 const {db,createUser}=await import("../../db.js");
 const studentEmail=`layout-${randomUUID()}@e2e.example`;
 createUser(studentEmail,"Layout Student With A Long Registered Name","LayoutStudent123!","student");
 const adminEmail=`layout-admin-${randomUUID()}@e2e.example`;
 createUser(adminEmail,"Administrator "+"LongName".repeat(10),"LayoutAdmin123!","admin");
 const studentId=db.prepare("SELECT id FROM users WHERE email=?").get(studentEmail).id;
 const id=randomUUID();
 const image="data:image/png;base64,"+(await readFile("public/assets/wallet.png")).toString("base64");
 db.prepare("INSERT INTO posts(id,user_id,kind,status,item_name,event_at,location,description,contact_details,image) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id,studentId,"Lost","Lost","Layout item with a descriptive and long title","2026-10-09T12:00","Campus library","Detailed item description "+"longtext".repeat(24),"Facebook: "+"contactname".repeat(16),image);
 try {
 const sizes=[[320,640],[393,851],[768,1024],[1024,768],[1280,720],[1536,864],[667,375]];
 const failures=[];
 async function inspect(label,w,h) {
  await page.evaluate(()=>document.fonts.ready);
  const issues=await page.evaluate(()=>{
   const bad=[];
   if(document.documentElement.scrollWidth>innerWidth+1) bad.push("page has horizontal overflow");
   const visible=el=>{const r=el.getBoundingClientRect();const c=getComputedStyle(el);return r.width>0&&r.height>0&&c.visibility!=="hidden"&&c.display!=="none";};
   for(const el of document.querySelectorAll('input:not([type=file]):not([type=hidden]),textarea')) {
    if(visible(el)&&parseFloat(getComputedStyle(el).fontSize)<16) bad.push("small input font: "+(el.name||el.id));
   }
   for(const el of document.querySelectorAll('button,summary,select,input:not([type=file]):not([type=hidden])')) {
    if(!visible(el)||el.closest('[hidden]')) continue;
    const r=el.getBoundingClientRect();
    if(r.width<24||r.height<24) bad.push("small control: "+(el.getAttribute('aria-label')||el.textContent.trim()).slice(0,55));
    if(r.left<-1||r.right>innerWidth+1) bad.push("control outside viewport: "+(el.getAttribute('aria-label')||el.textContent.trim()).slice(0,55));
   }
   const d=document.querySelector('dialog[open]');
   if(d&&d.scrollWidth>d.clientWidth+1) bad.push("dialog has horizontal overflow");
   return [...new Set(bad)];
  });
  failures.push(...issues.map(issue=>`${label} ${w}x${h}: ${issue}`));
  if(w===393||w===768||w===1280) await page.screenshot({path:info.outputPath(`${label}-${w}.png`),fullPage:true});
 }
 await page.goto('/#role');
 await page.getByRole('button',{name:'Student',exact:true}).click();
 for(const [w,h] of sizes) {
  await page.setViewportSize({width:w,height:h});
  for(const route of ['splash','role','login','register','forgot-password','about']) {
   await page.goto('/#'+route); await expect(page.locator('#app > *')).toBeVisible();
   if(route==='register') await expect(page.getByRole('tab',{name:'Register',exact:true})).toHaveAttribute('aria-selected','true');
   await inspect(route,w,h);
  }
  await page.evaluate(()=>{state.role='admin';authScreen();});await inspect('admin-login',w,h);
  await page.evaluate(()=>{state.role='student';});
  await page.evaluate(()=>verificationScreen('layout@e2e.example'));await inspect('verification',w,h);
  await page.evaluate(()=>passwordRecoveryScreen('layout@e2e.example'));await inspect('reset',w,h);
  await page.route('**/api/health',route=>route.abort());await page.reload();
  await expect(page.getByRole('heading',{name:'Unable to connect',exact:true})).toBeVisible();await inspect('connection-error',w,h);
  await page.unroute('**/api/health');await page.reload();await expect(page.getByRole('heading',{name:'About RETURNO',exact:true})).toBeVisible();
 }
 const studentLogin=await page.request.post('/api/login',{data:{email:studentEmail,password:'LayoutStudent123!',role:'student'}});
 expect(await studentLogin.text()).toContain('Layout Student');
 await page.reload(); await expect.poll(()=>page.evaluate(()=>state.user?.role)).toBe('student');
 for(const [w,h] of sizes) {
  await page.setViewportSize({width:w,height:h});
  for(const route of ['feed','mine','search','post','about']) {
   await page.goto('/#'+route);
   if(route==='feed'||route==='mine') await expect(page.locator(`[data-detail="${id}"]`)).toBeVisible();
   else if(route==='post') await expect(page.locator('#post-form')).toBeVisible();
   else await expect(page.locator('.page-header')).toBeVisible();
   await inspect('student-'+route,w,h);
   if(route==='feed') {
    await expect(page.locator('.page-header [data-go="search"]')).toHaveCount(0);
    const tools=page.locator('.post-toolbar');await expect(tools.getByRole('button',{name:'Search',exact:true})).toBeVisible();
    const filtersBox=await tools.locator('.filters').boundingBox();const searchBox=await tools.locator('.home-search').boundingBox();
    expect(searchBox.x).toBeGreaterThanOrEqual(filtersBox.x+filtersBox.width);
    const firstFilter=await tools.locator('.filters button').first().boundingBox();
    expect(Math.abs(searchBox.y+searchBox.height/2-firstFilter.y-firstFilter.height/2)).toBeLessThan(2);
   }
   if(route==='feed'||route==='mine') {
    const columns=await page.locator('.cards').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(w>=1500?7:w>=1200?6:w>=900?5:w>=700?4:2);
    const card=page.locator(`[data-detail="${id}"]`);const bounds=await card.boundingBox();const badge=await card.locator('.status').boundingBox();
    expect(badge.x+badge.width).toBeLessThanOrEqual(bounds.x+bounds.width);expect(badge.y).toBeLessThan(bounds.y+60);
   }
   if(route==='feed') {await page.locator(`[data-detail="${id}"]`).click();await expect(page.getByRole('dialog')).toBeVisible();await inspect('details',w,h);await page.keyboard.press('Escape');}
   if(route==='search') {await page.getByRole('button',{name:'Profile options',exact:true}).click();await inspect('student-menu',w,h);}
  }
 }
 await page.request.post('/api/logout');
 const adminLogin=await page.request.post('/api/login',{data:{email:adminEmail,password:'LayoutAdmin123!',role:'admin'}});
 expect(adminLogin.status()).toBe(200);
 await page.reload(); await expect.poll(()=>page.evaluate(()=>state.user?.role)).toBe('admin');
 for(const [w,h] of sizes) {
  await page.setViewportSize({width:w,height:h});
  for(const route of ['admin','admin-profile','search','about']) {
   await page.goto('/#'+route);
   if(route==='admin') await expect(page.locator(`[data-detail="${id}"]`)).toBeVisible();
   else if(route==='admin-profile') await expect(page.getByRole('heading',{name:'Registered users',exact:true})).toBeVisible();
   else await expect(page.locator('.page-header')).toBeVisible();
   await inspect(route,w,h);
   if(route==='admin-profile') {
    await page.getByRole('button',{name:'Delete account for '+studentEmail,exact:true}).click();await inspect('delete-dialog',w,h);await page.keyboard.press('Escape');
   }
   if(route==='admin') {
    await expect(page.locator('.page-header [data-go="search"]')).toHaveCount(0);
    const tools=page.locator('.post-toolbar');await expect(tools.getByRole('button',{name:'Search',exact:true})).toBeVisible();
    const filtersBox=await tools.locator('.filters').boundingBox();const searchBox=await tools.locator('.home-search').boundingBox();
    expect(searchBox.x).toBeGreaterThanOrEqual(filtersBox.x+filtersBox.width);
    const firstFilter=await tools.locator('.filters button').first().boundingBox();
    expect(Math.abs(searchBox.y+searchBox.height/2-firstFilter.y-firstFilter.height/2)).toBeLessThan(2);
    await page.locator(`[data-more="${id}"]`).click();
    await page.locator(`[data-update="${id}"]`).click();await inspect('update-dialog',w,h);await page.keyboard.press('Escape');
    await page.locator(`[data-more="${id}"]`).click();
    await page.locator(`[data-delete="${id}"]`).click();await inspect('delete-post-dialog',w,h);await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Profile options',exact:true}).click();await inspect('admin-menu',w,h);
    await page.getByRole('button',{name:'Register admin',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await inspect('register-admin',w,h);await page.keyboard.press('Escape');
    await page.locator(`[data-more="${id}"]`).click();await page.locator(`[data-edit="${id}"]`).click();await expect(page.locator('#post-form')).toBeVisible();await inspect('admin-editor',w,h);
   }
  }
 }
 await writeFile(info.outputPath('layout-audit.json'),JSON.stringify({sizes,failures},null,2));
 expect(failures).toEqual([]);
 } finally {
  db.prepare("DELETE FROM users WHERE email IN (?,?)").run(studentEmail,adminEmail);
 }
});
