import { randomUUID } from "node:crypto";
import { test, expect, verificationCodes } from "./fixtures.js";

const password = "BrowserStudent123!";
async function register(page, checkInvalidCode = false) {
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
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Confirm your email" }),
  ).toBeVisible();
  expect((await page.request.get("/api/me")).status()).toBe(401);
  await expect(page.getByRole("button", {name:"Back to registration",exact:true})).toBeVisible();
  if (checkInvalidCode) {
  await page.getByLabel("Verification code").fill("000000");
  await page
    .getByRole("button", { name: "Confirm email", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Incorrect verification code.",
  );
  }
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
  await expect(page.getByRole("button",{name:"Profile options",exact:true})).toHaveCount(0);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: role === "Student" ? "Welcome, Browser Test Student!" : "Welcome, Browser Test Admin!" }),
  ).toBeVisible();
}
async function logout(page) {
  if (!(await page.getByRole("button", {name:"Log out",exact:true}).isVisible())) await page.getByRole("button",{name:"Profile options",exact:true}).click();
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
  const email = await register(page, true);
  let studentSession = (await page.context().cookies()).find((cookie) => cookie.name === "retorno_session");
  await noOverflow(page);
  await page.getByRole("button",{name:"Profile options",exact:true}).click();
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
  await page.getByRole("button",{name:"Profile options",exact:true}).click();
  await page.getByRole("button", {name:"Your posts",exact:true}).click();
  await page.getByRole("button", {name:"Add post",exact:true}).click();
  await expect(page.getByLabel("Item name:", {exact:true})).toHaveValue("");
  await page.locator("#status-trigger").click();
  await page.getByRole("button", { name: "Lost", exact: true }).click();
  await page.getByLabel("How to contact you (optional):", {exact:true}).fill("Returno Test");
  await page.getByRole("button", {name:"Add contact method", exact:true}).click();
  await page.getByRole("button", {name:"Contact method",exact:true}).nth(1).click();
  await page.locator(".contact-options:visible").getByRole("button",{name:"Gmail",exact:true}).click();
  await page.getByLabel("How to contact you (optional):", {exact:true}).nth(1).fill("contact.test@gmail.com");
  await page.getByRole("button", {name:"Add contact method", exact:true}).click();
  await page.getByRole("button", {name:"Contact method",exact:true}).nth(2).click();
  await page.locator(".contact-options:visible").getByRole("button",{name:"Contact number",exact:true}).click();
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
  await expect(page.getByRole("status")).toContainText("Post published successfully.");
  await expect(card).toBeVisible();
  await expect(card.locator("img")).toBeVisible();
  await expect(card.locator(".card-contact")).toBeVisible();
  await expect(card.locator(".contact-heading")).toHaveText("Contact me");
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
  await expect(page.locator("dialog .contact-heading")).toHaveText("Contact me");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search posts" }).fill(item);
  await expect(
    page.getByRole("button", { name: `View details for ${item}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Post options" })).toHaveCount(0);
  await logout(page);
  await login(page, "Student", email, password);
  await expect(
    page.getByRole("button", { name: `View details for ${item}`, exact: true }),
  ).toBeVisible();
  studentSession = (await page.context().cookies()).find((cookie) => cookie.name === "retorno_session");
  await page.context().clearCookies();
  await page.goto("/#role");
  await login(page, "Admin", "admin@e2e.example", "BrowserAdmin123!");
  const adminSession = (await page.context().cookies()).find((cookie) => cookie.name === "retorno_session");
  const row = page
    .locator(".admin-row")
    .filter({ has: page.locator(`[data-detail="${id}"]`) });
  await expect(row).toBeVisible();
  await noOverflow(page);
  await row.locator("[data-detail]").click();
  await expect(page.getByRole("dialog")).toContainText(item);
  await expect(page.locator("dialog .contact-heading")).toHaveText("Contact me");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search posts" }).fill(item);
  await expect(row).toBeVisible();
  await expect(page.locator(".search-results.admin-list")).toBeVisible();
  await row.getByRole("button", { name: "Post options" }).click();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Description:", exact: true })
    .fill("Reviewed by administrator");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page).toHaveURL(/#search$/);
  await expect(page.getByRole("searchbox", { name: "Search posts" })).toHaveValue(item);
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
  await page.context().addCookies([studentSession]);
  await page.goto("/#feed");
  await page.reload();
  await expect.poll(() => page.evaluate(() => state.user?.role)).toBe("student");
  await expect(page.locator(`[data-detail="${id}"]`)).toBeVisible();
  for (const kind of ["Lost", "Found"]) {
    await page.locator(`[data-filter="${kind}"]`).click();
    await expect(page.locator(`[data-detail="${id}"]`)).toHaveCount(0);
  }
  await page.locator('[data-filter="All"]').click();
  await expect(page.locator(`[data-detail="${id}"]`)).toBeVisible();
  await page.context().addCookies([adminSession]);
  await page.goto("/#admin");
  await page.reload();
  await expect.poll(() => page.evaluate(() => state.user?.role)).toBe("admin");
  await expect(row).toBeVisible();
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
  await page.route("**/api/posts?q=*", (route) => route.abort());
  const input = page.getByRole("searchbox", { name: "Search posts" });
  await input.fill("no-match-browser-test");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "Retry search", exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/posts?q=*");
  await page.getByRole("button", { name: "Retry search", exact: true }).click();
  await expect(
    page.getByText("No posts found.", { exact: true }),
  ).toBeVisible();
  await expect(input).toHaveValue("no-match-browser-test");
  await expect(page.getByRole("region", {name:"Search history", exact:true})).toBeHidden();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(page.getByRole("button", {name:"Clear search", exact:true})).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "What are you looking for?" }),
  ).toBeVisible();
  const history=page.getByRole("region",{name:"Search history",exact:true});
  await expect(history).toBeVisible();
  await expect(history.getByRole("button",{name:"no-match-browser-test",exact:true})).toBeVisible();
  let releaseSearch;
  const gate=new Promise(resolve=>{releaseSearch=resolve;});
  await page.route("**/api/posts?q=*", async route=>{await gate;await route.continue();},{times:1});
  await input.fill("another-history-query");
  await expect(history).toBeHidden();
  await expect(page.getByText("Searching posts...",{exact:true})).toBeVisible();
  releaseSearch();
  await expect(page.getByText("No posts found.",{exact:true})).toBeVisible();
  await expect(history).toBeHidden();
  await page.getByRole("button",{name:"Clear search",exact:true}).click();
  await expect(history.locator(".history-entry")).toHaveText(["no-match-browser-test"]);
  await input.fill("another-history-query");
  await input.press("Enter");
  await expect(page.getByText("No posts found.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Clear search",exact:true}).click();
  await expect(history.locator(".history-entry")).toHaveCount(2);
  await history.getByRole("button",{name:"Remove no-match-browser-test from search history",exact:true}).click();
  await expect(history.locator(".history-entry")).toHaveText(["another-history-query"]);
  await history.getByRole("button",{name:"Clear history",exact:true}).click();
  await expect(history.getByText("No recent searches.",{exact:true})).toBeVisible();
  await expect(history.getByRole("button",{name:"Clear history",exact:true})).toBeHidden();
  await expect(input).toBeFocused();
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
 await page.getByRole("button", { name: "Profile options", exact: true }).click();
 const yourPosts = page.getByRole("button", { name: "Your posts", exact: true });
 const deletionMenuItem = page.getByRole("button", { name: "Account deletion request", exact: true });
 const yourPostsBounds = await yourPosts.boundingBox();
 const deletionMenuBounds = await deletionMenuItem.boundingBox();
 expect(deletionMenuBounds.y).toBeGreaterThan(yourPostsBounds.y);
 expect(deletionMenuBounds.y - (yourPostsBounds.y + yourPostsBounds.height)).toBeLessThan(12);
 await deletionMenuItem.click();
 const requestDialog = page.getByRole("dialog", { name: "Request account deletion", exact: true });
 await expect(requestDialog).toContainText("it does not delete your account now");
 await requestDialog.getByRole("button", { name: "Send request", exact: true }).click();
 await expect(page).toHaveURL(/#feed$/);
 await expect(page.locator("[data-account-deletion-status]")).toHaveCount(0);
 await page.getByRole("button", { name: "Profile options", exact: true }).click();
 await deletionMenuItem.click();
 const pendingDialog = page.getByRole("dialog", { name: "Cancel deletion request", exact: true });
 await expect(pendingDialog).toContainText("pending administrator review");
 await pendingDialog.getByRole("button", { name: "Cancel request", exact: true }).click();
 await expect(page.locator("[data-account-deletion-status]")).toHaveCount(0);
 await page.getByRole("button", { name: "Profile options", exact: true }).click();
 await deletionMenuItem.click();
 await page.getByRole("dialog", { name: "Request account deletion", exact: true }).getByRole("button", { name: "Send request", exact: true }).click();
 await expect(page.locator("[data-account-deletion-status]")).toHaveCount(0);
 await logout(page);
 await login(page, "Admin", "admin@e2e.example", "BrowserAdmin123!");
 await page.getByRole("button", { name: "Profile options", exact: true }).click();
 await page.getByRole("button", { name: "Admin profile", exact: true }).click();
 await expect(page.locator(".registered-user").filter({ hasText: email })).toContainText("Account deletion requested");
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
  await page.getByRole("button",{name:"Search",exact:true}).click();
  await page.getByRole("button",{name:"Back to home",exact:true}).click();
  await expect(page).toHaveURL(/#admin$/);
  await expect(page.locator(".stats")).toHaveCount(0);
  const totals=(await (await page.request.get("/api/stats")).json()).stats;
  for(const status of statuses) await expect(page.locator(`[data-admin-filter="${status}"] .filter-count`)).toHaveText("("+totals[status]+")");
  await expect(page.locator('[data-admin-filter=""] .filter-count')).toHaveText("("+statuses.reduce((sum,status)=>sum+totals[status],0)+")");
  const filters=page.getByRole("navigation",{name:"Report status"});
  const statusColors=new Set();
  for(const [i,status] of statuses.entries()) {
   const button=filters.getByRole("button",{name:status,exact:true});await button.click();
   await expect(button).toHaveAttribute("aria-pressed","true");
   const color=await button.evaluate(node=>getComputedStyle(node).backgroundColor);
   statusColors.add(color);
   await page.locator('.admin-row [data-detail="'+ids[i]+'"]').click();
   await expect(page.locator('dialog .status[data-status="'+status+'"]')).toHaveCSS("background-color",color);
   await page.getByRole("button",{name:"Close",exact:true}).click();
   await expect(page.locator('.admin-row [data-detail="'+ids[i]+'"]')).toBeVisible();
   for(const id of ids.filter(id=>id!==ids[i])) await expect(page.locator('.admin-row [data-detail="'+id+'"]')).toHaveCount(0);
   await noOverflow(page);
  }
  expect(statusColors.size).toBe(4);
  await filters.getByRole("button",{name:"All",exact:true}).click();
  for(const status of statuses) await expect(page.locator(`[data-admin-filter="${status}"]`)).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
  for(const id of ids) await expect(page.locator('.admin-row [data-detail="'+id+'"]')).toBeVisible();
 } finally {for(const id of ids)db.prepare("DELETE FROM posts WHERE id=?").run(id);}
});


test("admin directory sorts names and filters by name or email", async ({page}) => {
 await page.goto("/#role"); await login(page,"Admin","admin@e2e.example","BrowserAdmin123!");
 await page.route("**/api/users", route=>route.fulfill({json:{users:[
 {id:"a",role:"admin",full_name:"Zara Admin",email:"zara@test.example"},
 {id:"b",role:"admin",full_name:"Alice Admin",email:"alice@test.example"},
 {id:"c",role:"student",full_name:"Zoe Student",email:"zoe@test.example"},
 {id:"d",role:"student",full_name:"Ben Student",email:"ben@test.example"}]}}));
 await page.getByRole("button",{name:"Profile options",exact:true}).click();
 await page.getByRole("button",{name:"Admin profile",exact:true}).click();
 await expect(page.locator('.registered-user strong')).toHaveText(["Alice Admin","Zara Admin","Ben Student","Zoe Student"]);
 await expect(page.getByRole("button",{name:"Search",exact:true})).toHaveCount(0);
 const backHome=page.getByRole("button",{name:"Back to home",exact:true});
 const backBounds=await backHome.boundingBox();
 const welcomeBounds=await page.getByRole("heading",{name:"Welcome, Browser Test Admin!",exact:true}).boundingBox();
 expect(backBounds.y).toBeGreaterThanOrEqual(welcomeBounds.y+welcomeBounds.height);
 expect(backBounds.width).toBe(40);
 await expect(backHome).toHaveText("");
 await expect(backHome).toHaveCSS("border-top-style","solid");

 const options=page.getByRole("button",{name:"Profile options",exact:true});
 await options.click();
 await expect(page.getByRole("button",{name:"Register admin",exact:true})).toBeVisible();
 await noOverflow(page);
 await page.screenshot({path:test.info().outputPath("admin-profile-menu.png")});
 await page.keyboard.press("Escape");await expect(options).toBeFocused();
 await expect(page.getByRole("button",{name:"Register admin",exact:true})).toBeHidden();
 await options.click();await page.getByRole("heading",{name:"Registered users",exact:true}).click({position:{x:5,y:5}});
 await expect(page.getByRole("button",{name:"Register admin",exact:true})).toBeHidden();
 await options.click();await page.getByRole("button",{name:"Register admin",exact:true}).click();
 await expect(page.getByRole("dialog")).toBeVisible();
 await page.getByRole("button",{name:"Cancel",exact:true}).click();

 const search=page.getByRole("searchbox",{name:"Search registered users"});
 await search.fill("zoe@");
 await expect(page.locator('.registered-user:visible strong')).toHaveText(["Zoe Student"]);
 await search.fill("alice");
 await expect(page.locator('.registered-user:visible strong')).toHaveText(["Alice Admin"]);
 await search.fill("no-match"); await expect(page.getByRole("status")).toHaveText("0 matching users.");
 await search.fill(""); await expect(page.locator('.registered-user:visible')).toHaveCount(4);
 await noOverflow(page);
 await backHome.click();
 await expect(page.getByRole("heading",{name:"Welcome, Browser Test Admin!",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Search",exact:true}).click();
 await page.getByRole("button",{name:"Profile options",exact:true}).click();
 await page.getByRole("button",{name:"Register admin",exact:true}).click();
 await expect(page.getByRole("dialog")).toBeVisible();
 await page.getByRole("button",{name:"Cancel",exact:true}).click();
 await noOverflow(page);
});


test("post pages navigate without losing filters and details", async ({page}) => {
 const email=await register(page);
 const {db}=await import("../../db.js");
 const owner=db.prepare("SELECT id FROM users WHERE email=?").get(email);
 const ids=Array.from({length:30},()=>randomUUID());
 try {
  ids.forEach((id,i)=>db.prepare("INSERT INTO posts(id,user_id,kind,status,item_name,event_at,location,description) VALUES(?,?,?,?,?,?,?,?)").run(id,owner.id,"Found","Found","Paged fixture "+i,"2026-10-10T09:00","Test","Page details"));
  await page.getByRole("button",{name:"Profile options",exact:true}).click();
  await page.getByRole("button",{name:"Your posts",exact:true}).click();
  const nav=page.getByRole("navigation",{name:"Post pages"});
  await expect(page.locator('.own .card[data-detail]')).toHaveCount(28);
  await expect(nav).toContainText("Page 1 of 2");
  await nav.getByRole("button",{name:"Next",exact:true}).click();
  await expect(nav).toContainText("Page 2 of 2");
  await expect(page.locator('.own .card[data-detail]')).toHaveCount(2);
  await expect(nav.getByRole("button",{name:"Next",exact:true})).toBeDisabled();
  await page.locator('.own .card[data-detail]').first().click();await expect(page.getByRole("dialog")).toContainText("Page details");await page.getByRole("button",{name:"Close",exact:true}).click();
  await nav.getByRole("button",{name:"Previous",exact:true}).click();await expect(nav).toContainText("Page 1 of 2");
  await page.getByRole("button",{name:"Home",exact:true}).click();await page.getByRole("button",{name:"Search",exact:true}).click();
  await page.getByRole("searchbox",{name:"Search posts"}).fill("Paged fixture");await expect(nav).toContainText("Page 1 of 2");
  await nav.getByRole("button",{name:"Next",exact:true}).click();await expect(nav).toContainText("Page 2 of 2");await expect(page.locator('.search-results .card')).toHaveCount(2);
  await noOverflow(page);
 } finally {ids.forEach(id=>db.prepare("DELETE FROM posts WHERE id=?").run(id));}
});


test("About page is public, responsive and available to both roles", async ({page}) => {
 await page.goto("/#role");
 await expect(page.getByRole("button",{name:"Profile options",exact:true})).toHaveCount(0);
 const favicon=page.locator('link[rel="icon"]');
 await expect(favicon).toHaveAttribute("href","assets/favicon.svg");
 const icon=await page.request.get("/assets/favicon.svg");
 expect(icon.status()).toBe(200);expect(icon.headers()["content-type"]).toBe("image/svg+xml");
 await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{
  const img=new Image();img.onload=()=>resolve(img.naturalWidth>0);img.onerror=()=>resolve(false);img.src=document.querySelector('link[rel="icon"]').href;
 }))).toBe(true);
 await page.getByRole("button",{name:"About RETURNO",exact:true}).click();
 await expect(page.getByRole("heading",{name:"About RETURNO",exact:true})).toBeVisible();
 await expect(page.locator(".about-page .about-content [data-policy-link]")).toHaveCount(0);
 await expect(page.locator(".about-steps > li")).toHaveCount(3);
 const backButton=page.getByRole("button",{name:"Back",exact:true});
 await expect(page.locator(".page-header .about-back")).toHaveCount(1);
 await expect(backButton).toHaveText("");
 await expect(backButton).toHaveCSS("width","40px");
 await expect(backButton).toHaveCSS("border-top-style","solid");
 const backBox=await backButton.boundingBox();
 const aboutBox=await page.getByRole("heading",{name:"About RETURNO",exact:true}).boundingBox();
 expect(backBox.y+backBox.height).toBeLessThan(aboutBox.y);
 await expect(page.locator(".about-page")).toHaveCSS("background-color","rgb(255, 255, 255)");
 await noOverflow(page);
 await page.screenshot({path:test.info().outputPath("about-page.png"),fullPage:true});
 await page.getByRole("button",{name:"Back",exact:true}).click();
 await expect(page.getByRole("button",{name:"Student",exact:true})).toBeVisible();
 await register(page);
 const options=page.getByRole("button",{name:"Profile options",exact:true});
 await options.click();
 await expect(page.getByRole("button",{name:"Log out",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Register admin",exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Your posts",exact:true}).click();
 await expect(options).toBeVisible();
 await page.getByRole("button",{name:"Home",exact:true}).click();
 await page.getByRole("button",{name:"Search",exact:true}).click();
 await options.click();await expect(page.getByRole("button",{name:"Your posts",exact:true})).toBeVisible();
 await page.keyboard.press("Escape");await expect(options).toBeFocused();
 await expect(page.getByRole("button",{name:"Your posts",exact:true})).toBeHidden();
 await noOverflow(page);
 await page.getByRole("button",{name:"Home",exact:true}).click();
 await options.click();
 await page.locator('.profile-about > summary').click();
 await expect(page.locator('.profile-about [data-about-link]')).toBeVisible();
 await expect(page.locator('.page-header > [data-go="about"]')).toHaveCount(0);
 await expect(page.locator('.profile-about')).toBeVisible();
 await expect(page.locator('.profile-about [data-policy-link]')).toHaveCount(2);
 await expect(page.locator(".about-page .about-content [data-policy-link]")).toHaveCount(0);
 await logout(page);await login(page,"Admin","admin@e2e.example","BrowserAdmin123!");
 await options.click();await page.getByRole("button",{name:"Admin profile",exact:true}).click();
 const dashboardBack=page.getByRole("button",{name:"Back to home",exact:true});
 await expect(dashboardBack).toBeVisible();
 await expect(dashboardBack).toHaveCSS("width","40px");
 await expect(dashboardBack).toHaveCSS("grid-row","4");
 await expect(dashboardBack).toHaveCSS("justify-self","start");
 await options.click();
 await page.locator('.profile-about > summary').click();
 await expect(page.locator('.profile-about [data-about-link]')).toBeVisible();
 await page.locator('.profile-about [data-about-link]').click();
 await expect(page).toHaveURL(/#about$/);
 await expect(page.getByRole("heading",{name:"About RETURNO",exact:true})).toBeVisible();
 const adminAboutBack=page.locator(".page-header .about-back");
 await expect(adminAboutBack).toBeVisible();
 await expect(page.locator(".about-page .about-content [data-policy-link]")).toHaveCount(0);
 await expect(adminAboutBack).toHaveCSS("width","40px");
 await expect(adminAboutBack).toHaveCSS("grid-row","4");
 await expect(adminAboutBack).toHaveCSS("justify-self","start");
 await expect(page.locator('.profile-dropdown')).toHaveAttribute('open','');
 await page.getByRole("button",{name:"Register admin",exact:true}).click();
 await expect(page.getByRole("dialog")).toBeVisible();
 await page.getByRole("button",{name:"Cancel",exact:true}).click();
 await page.getByRole("button",{name:"Back",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Registered users",exact:true})).toBeVisible();
 await noOverflow(page);
});


test("back arrows return from authentication, recovery, search and own posts", async ({page}) => {
 await page.goto("/#role");
 await page.getByRole("button",{name:"Admin",exact:true}).click();
 await page.getByRole("button",{name:"Back to role selection",exact:true}).click();
 await expect(page).toHaveURL(/#role$/);
 await page.getByRole("button",{name:"Student",exact:true}).click();
 await page.getByRole("tab",{name:"Register",exact:true}).click();
 await noOverflow(page);
 await page.screenshot({path:test.info().outputPath("registration-back.png"),fullPage:true});
 await page.getByRole("button",{name:"Back to role selection",exact:true}).click();
 await page.getByRole("button",{name:"Student",exact:true}).click();
 await page.getByRole("button",{name:"Forgot password?",exact:true}).click();
 await page.getByRole("button",{name:"Back to log in",exact:true}).click();
 await expect(page).toHaveURL(/#login$/);
 await page.getByRole("button",{name:"Forgot password?",exact:true}).click();
 await page.getByLabel("Enter your registered email",{exact:true}).fill("nobody@e2e.example");
 await page.getByRole("button",{name:"Send reset code",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Reset password",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Back to log in",exact:true}).click();
 await expect(page).toHaveURL(/#login$/);
 await register(page);
 await page.getByRole("button",{name:"Profile options",exact:true}).click();
 await page.getByRole("button",{name:"Your posts",exact:true}).click();
 await page.getByRole("button",{name:"Add post",exact:true}).click();
 await expect(page.getByRole("button",{name:"Back",exact:true})).toHaveCount(0);
 await page.getByLabel("Item name:",{exact:true}).fill("Discarded draft");
 await page.getByRole("button",{name:"Cancel",exact:true}).click();
 await expect(page).toHaveURL(/#mine$/);
 await page.getByRole("button",{name:"Back to home",exact:true}).click();
 await expect(page).toHaveURL(/#feed$/);
 await page.getByRole("button",{name:"Search",exact:true}).click();
 await noOverflow(page);
 const back=page.getByRole("button",{name:"Back to home",exact:true});
 await expect(back).toHaveCSS("width","40px");
 await expect(back).toHaveText("");
 await back.click(); await expect(page).toHaveURL(/#feed$/);
});

test("policy documents are public, readable and registration requires acknowledgment", async ({ page }) => {
 await page.goto('/#register');
 const checkbox=page.getByRole('checkbox');
 await expect(checkbox).not.toBeChecked();
 await expect(checkbox).toHaveAttribute('required','');
 await page.getByLabel('Enter gmail').fill('policy-check@e2e.example');
 await page.getByLabel('Full name',{exact:true}).fill('Policy Check');
 await page.getByLabel('Set password',{exact:true}).fill(password);
 await page.getByLabel('Confirm password',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Register',exact:true}).click();
 await expect(page).toHaveURL(/#register$/);
 expect(await checkbox.evaluate(el=>el.validity.valueMissing)).toBe(true);
 await page.locator('.policy-agreement').getByRole('link',{name:'Privacy Policy',exact:true}).click();
 const policy=page;
 await expect(policy).toHaveURL(/privacy\.html/);
 await expect(policy.getByRole('heading',{name:'Privacy Policy',exact:true})).toBeVisible();
 await expect(policy.getByText('Last updated: October 12, 2026')).toBeVisible();
 await expect(policy.locator('footer.legal')).toHaveCount(0);
 await expect(policy.locator('.policy-tabs')).toHaveCount(0);
 await expect(policy.getByRole('link',{name:'Terms and Conditions',exact:true})).toHaveCount(0);
 await expect(policy.locator('.policy-card p').nth(2)).toHaveCSS('text-align','justify');
 await expect(policy.locator('.policy-card p').nth(2)).toHaveCSS('text-align-last','left');
 await expect(policy.getByRole('heading',{name:'11. Contact Us',exact:true})).toBeVisible();
 await expect(policy.getByText(/javellellantada01@gmail.com/)).toBeVisible();
 expect(await policy.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(policy.getByRole('button',{name:'Back',exact:true})).toHaveAttribute('href','/#login');
 await policy.getByRole('button',{name:'Back',exact:true}).click();
 await expect(policy).toHaveURL(/#login$/);
 await expect(policy.getByRole('button',{name:'Log In',exact:true})).toBeVisible();
 await page.goto('/#register');
 await page.locator('.policy-agreement').getByRole('link',{name:/Terms/}).click();
 const termsPage=page;
 await expect(termsPage.getByRole('heading',{name:'Terms and Conditions',exact:true})).toBeVisible();
 await expect(termsPage.locator('.policy-tabs')).toHaveCount(0);
 await expect(termsPage.getByRole('link',{name:'Privacy Policy',exact:true})).toHaveCount(0);
 await expect(termsPage.getByRole('heading',{name:'9. Contact Us',exact:true})).toBeVisible();
 await expect(termsPage.locator('.policy-card p').nth(1)).toHaveCSS('text-align','justify');
 await expect(termsPage.getByRole('button',{name:'Back',exact:true})).toHaveAttribute('href','/#login');
 await termsPage.screenshot({path:test.info().outputPath('terms-conditions.png'),fullPage:true});
 await termsPage.getByRole('button',{name:'Back',exact:true}).click();
 await expect(termsPage).toHaveURL(/#login$/);
 await page.goto('/#register');
 await expect(page.getByLabel('Full name',{exact:true})).toBeVisible();
 await page.getByLabel('Full name',{exact:true}).fill('Policy Check');
 await page.getByLabel('Enter gmail').fill('policy-check@e2e.example');
 await page.getByLabel('Set password',{exact:true}).fill(password);
 await page.getByLabel('Confirm password',{exact:true}).fill(password);
 await checkbox.check();
 await page.screenshot({path:test.info().outputPath('policy-registration.png'),fullPage:true});
});


test("compact menu keeps separate About links and policy pages share the About layout", async ({ page }) => {
 await register(page);
 const options=page.getByRole('button',{name:'Profile options',exact:true});
 await options.click();
 await expect(page.locator('.profile-options > button')).toHaveText(['Your posts','Account deletion request','Log out']);
 const postsMenu=page.locator('.profile-options').getByRole('button',{name:'Your posts',exact:true});
 const deletionMenu=page.locator('.profile-options').getByRole('button',{name:'Account deletion request',exact:true});
 expect((await deletionMenu.boundingBox()).y).toBeGreaterThan((await postsMenu.boundingBox()).y);
 await expect(page.locator('.account-deletion')).toHaveCount(0);
 await expect(page.locator('.profile-options [data-logout]')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 const about=page.locator('.profile-about');
 await expect(about.locator('summary')).toHaveText('About');
 await about.locator('summary').click();
 await expect(about.locator('button, a')).toHaveText(['About RETURNO','Terms and Conditions','Privacy Policy']);
 expect(await about.locator('summary, button, a').evaluateAll(elements=>elements.map(element=>getComputedStyle(element).paddingLeft))).toEqual(['12px','12px','12px','12px']);
 await about.getByRole('link',{name:'About RETURNO',exact:true}).click();
 await expect(page).toHaveURL(/\/?return=feed&role=student&name=.*#about$/);
 await expect(page.getByRole('heading',{name:'About RETURNO',exact:true})).toBeVisible();
 await page.locator('.profile-about').getByRole('link',{name:'Terms and Conditions',exact:true}).click();
 await expect(page).toHaveURL(/\/terms\.html\?return=about&.*aboutReturn=feed.*$/);
 await expect(page.getByRole('heading',{name:'Terms and Conditions',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Welcome, Browser Test Student!',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Profile options',exact:true})).toBeVisible();
 await expect(page.locator('.profile-dropdown')).toHaveAttribute('open','');
 const termsMenu=page.locator('.profile-options');
 await expect(termsMenu.locator('[data-policy-role="student"] button')).toHaveText(['Your posts','Account deletion request']);
 await expect(termsMenu.locator('> button[data-policy-action="logout"]')).toHaveText('Log out');
 await expect(termsMenu.locator('.profile-about button, .profile-about a')).toHaveText(['About RETURNO','Terms and Conditions','Privacy Policy']);
 await termsMenu.getByRole('button',{name:'Privacy Policy',exact:true}).click();
 await expect(page).toHaveURL(/\/privacy\.html\?return=about&.*aboutReturn=feed.*$/);
 await expect(page.getByRole('heading',{name:'Privacy Policy',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Welcome, Browser Test Student!',exact:true})).toBeVisible();
 await expect(page.locator('.profile-dropdown')).toHaveAttribute('open','');
 await expect(page.locator('.profile-about')).toHaveAttribute('open','');
 await expect(page.locator('.profile-options [data-policy-role="student"] button')).toHaveText(['Your posts','Account deletion request']);
 await expect(page.locator('.profile-options > button[data-policy-action="logout"]')).toHaveText('Log out');
 await page.locator('.profile-options').getByRole('button',{name:'Terms and Conditions',exact:true}).click();
 await expect(page).toHaveURL(/\/terms\.html\?return=about&.*aboutReturn=feed.*$/);
 await expect(page.getByRole('button',{name:'Back',exact:true})).toHaveAttribute('href','/?return=feed#about');
 await expect(page.locator('.policy-card')).toContainText('Last updated: October 12, 2026');
 await expect(page.locator('.profile-dropdown')).toHaveCount(1);
 await expect(page.locator('.about-page > .page-header .home-logo img')).toBeVisible();
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await expect(page).toHaveURL(/\/?return=feed#about$/);
 await expect(page.getByRole('heading',{name:'About RETURNO',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await expect(page).toHaveURL(/#feed$/);
 await page.goto('/#role');
 await login(page,'Admin','admin@e2e.example','BrowserAdmin123!');
 await options.click();
 await expect(page.locator('.profile-options > button')).toHaveText(['Admin profile','Register admin','Log out']);
 await expect(page.locator('.profile-options [data-logout]')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 const adminAbout=page.locator('.profile-about');
 await expect(adminAbout.locator('summary')).toHaveText('About');
 await adminAbout.locator('summary').click();
 await expect(adminAbout.locator('button, a')).toHaveText(['About RETURNO','Terms and Conditions','Privacy Policy']);
 expect(await adminAbout.locator('summary, button, a').evaluateAll(elements=>elements.map(element=>getComputedStyle(element).paddingLeft))).toEqual(['12px','12px','12px','12px']);
 await adminAbout.getByRole('link',{name:'About RETURNO',exact:true}).click();
 await expect(page).toHaveURL(/\/?return=admin&role=admin&name=.*#about$/);
 await page.locator('.profile-about').getByRole('link',{name:'Privacy Policy',exact:true}).click();
 await expect(page).toHaveURL(/\/privacy\.html\?return=about&.*aboutReturn=admin.*$/);
 await expect(page.getByRole('heading',{name:'Welcome, Browser Test Admin!',exact:true})).toBeVisible();
 await expect(page.locator('.profile-dropdown')).toHaveAttribute('open','');
 await expect(page.locator('.profile-about')).toHaveAttribute('open','');
 await expect(page.locator('.profile-options [data-policy-role="admin"] button')).toHaveText(['Admin profile','Register admin']);
 await expect(page.locator('.profile-options > button[data-policy-action="logout"]')).toHaveText('Log out');
 await expect(page.getByRole('button',{name:'Back',exact:true})).toHaveAttribute('href','/?return=admin#about');
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await expect(page).toHaveURL(/\/?return=admin#about$/);
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await expect(page).toHaveURL(/#admin$/);
 await page.goto('/terms.html?return=https://example.com');
 await expect(page.getByRole('button',{name:'Back',exact:true})).toHaveAttribute('href','/#feed');
});
