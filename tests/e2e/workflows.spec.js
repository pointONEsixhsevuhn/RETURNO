import { randomUUID } from "node:crypto";
import { test, expect, verificationCodes } from "./fixtures.js";

const password = "BrowserStudent123!";
async function register(page) {
  const email = `student-${randomUUID()}@e2e.example`;
  await page.goto("/#role");
  await page.getByRole("button", { name: "Student", exact: true }).click();
  await page.getByRole("tab", { name: "Register", exact: true }).click();
  await page.getByLabel("Enter gmail").fill(email);
  await page
    .getByLabel("Full name", { exact: true })
    .fill("Browser Test Student");
  await page.getByLabel("Set password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Confirm your email" }),
  ).toBeVisible();
  expect((await page.request.get("/api/me")).status()).toBe(401);
  await page.getByLabel("Verification code").fill("000000");
  await page
    .getByRole("button", { name: "Confirm email", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Incorrect verification code.",
  );
  await page.getByLabel("Verification code").fill(verificationCodes.get(email));
  await page
    .getByRole("button", { name: "Confirm email", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome, Browser Test Student!" }),
  ).toBeVisible();
  return email;
}
async function login(page, role, email, pass) {
  await page.getByRole("button", { name: role, exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: role === "Student" ? "Welcome, Browser Test Student!" : "WELCOME, ADMIN!" }),
  ).toBeVisible();
}
async function logout(page) {
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Student", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/me")).status()).toBe(401);
}
async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("student report lifecycle and administrator review, edit, return and delete", async ({
  page,
}) => {
  const email = await register(page);
  await noOverflow(page);
  await page.getByRole("button", { name: "Your posts", exact: true }).click();
  await page.getByRole("button", { name: "Add post", exact: true }).click();
  await page.getByLabel("Item name:", {exact:true}).fill("Unsaved draft");
  await page.getByRole("button", {name:"Cancel",exact:true}).click();
  await expect(page).toHaveURL(/#mine$/);
  await expect(page.locator("#post-form")).toHaveCount(0);
  for (let attempt=0; attempt<2; attempt++) {
    await page.getByRole("button", {name:"Add post",exact:true}).click();
    await page.getByRole("button", {name:"Cancel",exact:true}).click();
    await expect(page).toHaveURL(/#mine$/);
  }
  await page.goBack();
  await expect(page).toHaveURL(/#feed$/);
  await page.getByRole("button", {name:"Your posts",exact:true}).click();
  await page.getByRole("button", {name:"Add post",exact:true}).click();
  await expect(page.getByLabel("Item name:", {exact:true})).toHaveValue("");
  await page.locator("#status-trigger").click();
  await page.getByRole("button", { name: "Lost", exact: true }).click();
  await page.getByLabel("How to contact you (optional):", {exact:true}).fill("Returno Test");
  await page.getByRole("button", {name:"Add contact method", exact:true}).click();
  await page.getByLabel("Contact method", {exact:true}).nth(1).selectOption("Gmail");
  await page.getByLabel("How to contact you (optional):", {exact:true}).nth(1).fill("contact.test@gmail.com");
  await page.getByRole("button", {name:"Add contact method", exact:true}).click();
  await page.getByLabel("Contact method", {exact:true}).nth(2).selectOption("Contact number");
  await page.getByLabel("How to contact you (optional):", {exact:true}).nth(2).fill("09123456789");
  await page.getByRole("button", {name:"Add contact method", exact:true}).click();
  await page.getByRole("button", {name:"Remove contact method", exact:true}).last().click();
  await page.locator("#status-trigger").click();
  await page.getByRole("button", {name:"Found",exact:true}).click();
  await expect(page.getByLabel("Date time found:", {exact:true})).toBeVisible();
  await page.locator("#status-trigger").click();
  await page.getByRole("button", {name:"Lost",exact:true}).click();
  await expect(page.getByLabel("Date time lost:", {exact:true})).toBeVisible();
  await expect(page.locator("#post-form")).not.toContainText("PHT");
  const item = `Browser wallet ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Item name:", { exact: true }).fill(item);
  await page
    .getByLabel("Date time lost:", { exact: true })
    .fill("2026-10-06T12:30");
  await page
    .getByLabel("Location/Address :", { exact: true })
    .fill("Campus library");
  await page
    .getByLabel("Description:", { exact: true })
    .fill("Blue wallet used for isolated browser tests");
  await page
    .getByLabel("Upload your image here", { exact: true })
    .setInputFiles("public/assets/wallet.png");
  await expect(page.locator("#upload-preview img")).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const card = page.getByRole("button", {
    name: `View details for ${item}`,
    exact: true,
  });
  await expect(card).toBeVisible();
  await expect(card.locator("img")).toBeVisible();
  await expect(card.locator(".card-contact")).toBeVisible();
  await expect(card.locator(".card-contact")).toContainText("contact.test@gmail.com");
  await noOverflow(page);
  await expect(page.getByRole("button", { name: "Post options" })).toHaveCount(
    0,
  );
  const posts = await (await page.request.get("/api/posts?mine=1")).json();
  const savedPost = posts.posts.find((post) => post.item_name === item);
  expect(savedPost.contact_details).toBe("Facebook: Returno Test\nGmail: contact.test@gmail.com\nContact number: 09123456789");
  const id = savedPost.id;
  expect(
    (
      await page.request.patch(`/api/posts/${id}`, {
        data: { status: "Returned" },
      })
    ).status(),
  ).toBe(403);
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Campus library");
  await expect(page.getByRole("dialog")).toContainText("Date & time lost:");
  await expect(page.getByRole("dialog")).toContainText("Facebook: Returno Test");
  await expect(page.getByRole("dialog")).toContainText("contact.test@gmail.com");
  await expect(page.getByRole("dialog")).toContainText("09123456789");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search posts" }).fill(item);
  await expect(
    page.getByRole("button", { name: `View details for ${item}`, exact: true }),
  ).toBeVisible();
  await logout(page);
  await login(page, "Student", email, password);
  await expect(
    page.getByRole("button", { name: `View details for ${item}`, exact: true }),
  ).toBeVisible();
  await logout(page);
  await login(page, "Admin", "admin@e2e.example", "BrowserAdmin123!");
  const row = page
    .locator(".admin-row")
    .filter({ has: page.locator(`[data-detail="${id}"]`) });
  await expect(row).toBeVisible();
  await noOverflow(page);
  await row.locator("[data-detail]").click();
  await expect(page.getByRole("dialog")).toContainText(item);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await row.getByRole("button", { name: "Post options" }).click();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Description:", exact: true })
    .fill("Reviewed by administrator");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Post options" }).click();
  await row.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "Update post status",
  );
  await page.getByLabel("Status:", { exact: true }).selectOption("Returned");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Update", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const stored = await (await page.request.get(`/api/posts/${id}`)).json();
  expect(stored.post.status).toBe("Returned");
  expect(stored.post.description).toBe("Reviewed by administrator");
  await row.getByRole("button", { name: "Post options" }).click();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName("Delete post");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await logout(page);
});

test("expired session returns to login and allows the student to sign in again", async ({
  page,
}) => {
  const email = await register(page);
  expect((await page.request.post("/api/logout")).status()).toBe(200);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search posts" }).fill("wallet");
  await expect(page.getByRole("alert")).toHaveText(
    "Your session has expired. Please log in again.",
  );
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome, Browser Test Student!" }),
  ).toBeVisible();
  await logout(page);
});

test("search failure offers manual retry and clearing restores suggestions", async ({
  page,
}) => {
  await register(page);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.route("**/api/posts?q=*", (route) => route.abort(), { times: 1 });
  const input = page.getByRole("searchbox", { name: "Search posts" });
  await input.fill("no-match-browser-test");
  await expect(
    page.getByRole("button", { name: "Retry search", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry search", exact: true }).click();
  await expect(
    page.getByText("No posts found.", { exact: true }),
  ).toBeVisible();
  await expect(input).toHaveValue("no-match-browser-test");
  await expect(page.getByRole("button", {name:"no-match-browser-test", exact:true})).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(page.getByRole("button", {name:"Clear search", exact:true})).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "What are you looking for?" }),
  ).toBeVisible();
  for (const category of await page.locator(".category").all()) {
    const image = category.locator("img");
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate(
          (element) => element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const imageBounds = await image.boundingBox();
    const categoryBounds = await category.boundingBox();
    expect(imageBounds.height).toBeGreaterThan(0);
    expect(imageBounds.y + imageBounds.height).toBeLessThanOrEqual(
      categoryBounds.y + categoryBounds.height,
    );
    await expect(image).toHaveCSS("object-fit", "contain");
  }
  await noOverflow(page);
  await logout(page);
});

test("admin confirms account deletion, removes its reports and invalidates the student's session", async ({ page }) => {
 const email = await register(page);
 const response = await page.request.post("/api/posts", { data: { kind: "Lost", item_name: "Account deletion report", event_at: "2026-10-08T12:00", location: "Library", description: "Delete with account" } });
 expect(response.status()).toBe(201);
 const id = (await response.json()).post.id;
 const target = (await (await page.request.get("/api/me")).json()).user;
 const studentCookies = await page.context().cookies();
 expect((await page.request.delete(`/api/users/${target.id}`, { data: { confirmEmail: email } })).status()).toBe(403);
 await logout(page);
 await login(page, "Admin", "admin@e2e.example", "BrowserAdmin123!");
 await page.getByRole("button", { name: "Admin profile", exact: true }).click();
 await expect(page.getByRole("button", { name: "Delete account for admin@e2e.example", exact: true })).toHaveCount(0);
 const remove = page.getByRole("button", { name: `Delete account for ${email}`, exact: true });
 await remove.click();
 const dialog = page.getByRole("dialog", { name: "Delete account", exact: true });
 await expect(dialog).toContainText("All their reports will be permanently deleted");
 await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
 await expect(remove).toBeVisible();
 await remove.click();
 await page.getByLabel("Type the account email to confirm").fill("wrong@example.test");
 await dialog.getByRole("button", { name: "Delete account", exact: true }).click();
 await expect(dialog.getByRole("alert")).toContainText("Enter the account's email address");
 await page.getByLabel("Type the account email to confirm").fill(email);
 await dialog.getByRole("button", { name: "Delete account", exact: true }).click();
 await expect(dialog).not.toBeVisible();
 await expect(remove).toHaveCount(0);
 expect((await page.request.get(`/api/posts/${id}`)).status()).toBe(404);
 await noOverflow(page);
 await page.context().clearCookies();
 await page.context().addCookies(studentCookies);
 expect((await page.request.get("/api/me")).status()).toBe(401);
});

test("student recovers a forgotten password using the emailed code and signs in again", async ({ page }) => {
 const email=await register(page);
 await logout(page);
 await page.getByRole("button",{name:"Student",exact:true}).click();
 await page.getByRole("button",{name:"Forgot password?",exact:true}).click();
 await page.getByLabel("Enter your registered email",{exact:true}).fill(email);
 await page.getByRole("button",{name:"Send reset code",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Reset password",exact:true})).toBeVisible();
 await page.getByLabel("Reset code",{exact:true}).fill("000000");
 const newPassword="RecoveredStudent123!";
 await page.getByLabel("New password",{exact:true}).fill(newPassword);
 await page.getByLabel("Confirm new password",{exact:true}).fill(newPassword);
 await page.getByRole("button",{name:"Change password",exact:true}).click();
 await expect(page.getByRole("alert")).toContainText("Invalid or expired reset code");
 await page.getByLabel("Reset code",{exact:true}).fill(verificationCodes.get(email));
 await noOverflow(page);
 await page.getByRole("button",{name:"Change password",exact:true}).click();
 await expect(page.getByRole("button",{name:"Log In",exact:true})).toBeVisible();
 await expect(page.getByRole("alert")).toContainText("Password changed");
 await page.getByLabel("Email",{exact:true}).fill(email);
 await page.getByLabel("Password",{exact:true}).fill(newPassword);
 await page.getByRole("button",{name:"Log In",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Welcome, Browser Test Student!"})).toBeVisible();
});

test("student login/register switcher supports taps, keyboard arrows and directional swipes", async ({ page }) => {
 await page.goto("/#role");
 await page.getByRole("button",{name:"Student",exact:true}).click();
 const loginTab=page.getByRole("tab",{name:"Log in",exact:true});
 const registerTab=page.getByRole("tab",{name:"Register",exact:true});
 await expect(loginTab).toHaveAttribute("aria-selected","true");
 await registerTab.click();
 await expect(page.getByLabel("Full name",{exact:true})).toBeVisible();
 await loginTab.click();
 await loginTab.press("ArrowRight");
 await expect(registerTab).toHaveAttribute("aria-selected","true");
 await registerTab.press("ArrowLeft");
 await expect(loginTab).toHaveAttribute("aria-selected","true");
 async function swipe(dx,dy=0,selector=".screen") {
  await page.evaluate(({dx,dy,selector})=>{
   const target=document.querySelector(selector);
   const start=new Touch({identifier:1,target,clientX:180,clientY:220});
   const end=new Touch({identifier:1,target,clientX:180+dx,clientY:220+dy});
   target.dispatchEvent(new TouchEvent("touchstart",{bubbles:true,touches:[start]}));
   target.dispatchEvent(new TouchEvent("touchend",{bubbles:true,changedTouches:[end]}));
  },{dx,dy,selector});
 }
 await swipe(-100);
 await expect(registerTab).toHaveAttribute("aria-selected","true");
 await swipe(100);
 await expect(loginTab).toHaveAttribute("aria-selected","true");
 await swipe(-100,200);
 await expect(loginTab).toHaveAttribute("aria-selected","true");
 await swipe(-100,0,"#password");
 await expect(loginTab).toHaveAttribute("aria-selected","true");
 await noOverflow(page);
});

test("admin status filters show counts and select each report status", async ({page,testServer}) => {
 const {db}=await import("../../db.js");
 const admin=db.prepare("SELECT id FROM users WHERE email=?").get("admin@e2e.example");
 const statuses=["Lost","Found","Returned","Claimed"]; const ids=statuses.map(()=>randomUUID());
 try {
  statuses.forEach((status,i)=>db.prepare("INSERT INTO posts(id,user_id,kind,status,item_name,event_at,location,description) VALUES(?,?,?,?,?,?,?,?)").run(ids[i],admin.id,status==="Lost"?"Lost":"Found",status,"Filter fixture "+status,"2026-10-09T12:00","Test","Isolated filter test"));
  await page.goto("/#role"); await login(page,"Admin","admin@e2e.example","BrowserAdmin123!");
  await expect(page.locator(".stats")).toHaveCount(0);
  const totals=(await (await page.request.get("/api/stats")).json()).stats;
  for(const status of statuses) await expect(page.locator(`[data-admin-filter="${status}"] .filter-count`)).toHaveText("("+totals[status]+")");
  await expect(page.locator('[data-admin-filter=""] .filter-count')).toHaveText("("+statuses.reduce((sum,status)=>sum+totals[status],0)+")");
  const filters=page.getByRole("navigation",{name:"Report status"});
  for(const [i,status] of statuses.entries()) {
   const button=filters.getByRole("button",{name:status,exact:true});await button.click();
   await expect(button).toHaveAttribute("aria-pressed","true");
   await expect(page.locator('.admin-row [data-detail="'+ids[i]+'"]')).toBeVisible();
   for(const id of ids.filter(id=>id!==ids[i])) await expect(page.locator('.admin-row [data-detail="'+id+'"]')).toHaveCount(0);
   await noOverflow(page);
  }
  await filters.getByRole("button",{name:"All",exact:true}).click();
  for(const id of ids) await expect(page.locator('.admin-row [data-detail="'+id+'"]')).toBeVisible();
 } finally {for(const id of ids)db.prepare("DELETE FROM posts WHERE id=?").run(id);}
});
