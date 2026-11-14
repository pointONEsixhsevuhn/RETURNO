"use strict";
const app = document.querySelector("#app");
const dialog = document.querySelector("#dialog");
const state = {
  user: null,
  role: "student",
  filter: "All",
  query: "",
  searchHistory: [],
  notice: "",
  posts: [],
  edit: null,
  back: "mine",
  aboutBack: "",
  minePage: 1,
  searchPage: 1,
  adminStatus: "",
  adminPage: 1,
  outcomeNotificationCount: 0,
  directImageUpload: false,
};
let renderVersion = 0;
let dialogHistoryEntry = false;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const logo = '<img class="logo" src="assets/logo.png" alt="RETURNO">';
const searchIcon =
  '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="49" fill="#191919"/><circle cx="43" cy="42" r="20" fill="none" stroke="white" stroke-width="6"/><path d="M58 57 74 73" stroke="white" stroke-width="6" stroke-linecap="round"/></svg>';
const profileIcon =
  '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="28" r="27" fill="#191919"/><path d="M3 98V85Q10 55 35 54Q50 65 65 54Q90 56 97 85V98Z" fill="#191919"/></svg>';
let sessionVersion = 0;
async function api(url, options) {
  const version = sessionVersion;
  try {
    const result = await globalThis.RetornoAPI.request(url, options);
    if (version !== sessionVersion)
      throw Object.assign(new Error("Session changed."), { handled: true });
    return result;
  } catch (error) {
    if (version !== sessionVersion) error.handled = true;
    if (
      !error.handled &&
      error.status === 401 &&
      state.user &&
      !["/login", "/register", "/logout"].includes(url)
    ) {
      clearSession();
      go("login", { replace: true });
      document.querySelector("#auth-error").textContent =
        "Your session has expired. Please log in again.";
      error.handled = true;
    }
    throw error;
  }
}
function clearSession() {
  state.searchHistory = [];
  state.notice = "";
  ++sessionVersion;
  state.user = null;
  state.filter = "All";
  state.query = "";
  state.posts = [];
  state.edit = null;
  state.back = "mine";
  state.aboutBack = "";
}
function go(route, { replace = false, historyState = null } = {}) {
  if (route === "about" && location.hash !== "#about") state.aboutBack = location.hash.slice(1) || "role";
  const target = "#" + route;
  if (location.hash === target) {
    render();
    return;
  }
  if (dialogHistoryEntry) dialogHistoryEntry = false;
  if (replace) history.replaceState(historyState, "", target);
  else history.pushState(historyState, "", target);
  if (route !== "post") state.edit = null;
  window.scrollTo(0, 0);
  render();
}
function errorAt(target, error) {
  if (error.handled) return;
  target.textContent = error.message || error;
}
function backButton(route, label = "Back", extraClass = "") {
  return `<button type="button" class="profile-back-home ${extraClass}" data-go="${esc(route)}" data-return aria-label="${esc(label)}" title="${esc(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h18"/></svg></button>`;
}
function header(search = true, welcome = true, backControl = "") {
  if (!backControl && ["mine", "search"].includes(location.hash.slice(1))) backControl = backButton(state.user.role === "admin" ? "admin" : "feed", "Back to home");
  const admin = state.user.role === "admin";
  if (["#feed", "#admin"].includes(location.hash) || (admin && location.hash === "#admin-profile")) search = false;
  const policyRoute = location.hash.slice(1) || (admin ? "admin" : "feed");
  const policyParams = new URLSearchParams({
    return: policyRoute,
    role: admin ? "admin" : "student",
    name: state.user.fullName || (admin ? "Admin" : "Student"),
  });
  if (policyRoute === "about") {
    const aboutReturn = state.aboutBack || new URLSearchParams(location.search).get("return");
    const allowedAboutReturns = new Set(["role", "login", "feed", "mine", "search", "admin", "admin-profile"]);
    policyParams.set("aboutReturn", allowedAboutReturns.has(aboutReturn) ? aboutReturn : admin ? "admin" : "feed");
  }
  const policyContext = `?${policyParams}`;
  const notificationCount = Number.isSafeInteger(state.outcomeNotificationCount) && state.outcomeNotificationCount >= 0 ? state.outcomeNotificationCount : 0;
  const profile = '<details class="profile-dropdown"' + (location.hash === "#about" ? " open" : "") + '><summary class="icon profile-trigger" role="button" aria-label="Profile options">' + profileIcon + '<span class="profile-chevron" aria-hidden="true"></span></summary><div class="profile-options' + (admin ? ' admin-profile-options' : '') + '" aria-label="Profile options">' + (admin ? '<button type="button" data-go="admin-profile">Admin profile</button><button type="button" data-add-admin>Register admin</button><button type="button" data-open-outcome-notifications>Student outcome notifications <span class="notification-count" data-notification-count>'+ notificationCount +'</span></button>' : '<button type="button" data-go="mine">Your posts</button><button type="button" data-account-deletion-menu>Request account deletion</button>') + '<button type="button" data-logout>Log out</button><details class="profile-about"' + (location.hash === "#about" ? " open" : "") + '><summary>About</summary><a href="/' + policyContext + '#about" data-about-link>About RETURNO</a><a href="/terms.html' + policyContext + '" data-policy-link>Terms and Conditions</a><a href="/privacy.html' + policyContext + '" data-policy-link>Privacy Policy</a></details></div></details>';
  return `<header class="page-header"><button class="home-logo" data-go="${admin ? "admin" : "feed"}" aria-label="Home">${logo}</button><div class="brand-line"></div>${welcome ? `<h1 class="welcome">Welcome, ${esc(state.user.fullName || (admin ? "Admin" : "Student"))}!</h1>` : ""}${backControl || (admin && location.hash === "#admin-profile" ? '<button type="button" class="profile-back-home" data-go="admin" aria-label="Back to home" title="Back to dashboard"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h18"/></svg></button>' : "")}<div class="header-actions"><div class="header-icons">${search ? `<button class="icon" data-go="search" aria-label="Search">${searchIcon}</button>` : ""}${profile}</div></div></header>`;
}
function bindNavigation() {
  app
    .querySelectorAll("[data-go]")
    .forEach((el) => (el.onclick = () => go(el.dataset.go, { replace: el.hasAttribute("data-return") })));
  app.querySelectorAll("[data-account-deletion-menu]").forEach(button => {
    const menu = app.querySelector(".profile-dropdown");
    const updateLabel = request => {
      button.textContent = request ? "Cancel account deletion request" : "Request account deletion";
    };
    const syncLabel = async () => {
      try {
        const { request } = await api("/account-deletion-request");
        updateLabel(request);
      } catch {
        // The action itself reports errors when clicked; opening the menu remains usable.
      }
    };
    if (menu) {
      menu.addEventListener("toggle", () => {
        if (menu.open) syncLabel();
      });
      if (menu.open) syncLabel();
    }
    button.onclick = async () => {
      if (menu) menu.open = false;
      const pageVersion = renderVersion;
      button.disabled = true;
      try {
        const { request } = await api("/account-deletion-request");
        updateLabel(request);
        if (pageVersion !== renderVersion) return;
        showAccountDeletionDialog(request, pageVersion, button);
      } catch (error) {
        errorDialog(error);
      } finally {
        button.disabled = false;
      }
    };
  });
  app.querySelectorAll("[data-open-outcome-notifications]").forEach(button => button.onclick = async () => {
    const menu = app.querySelector(".profile-dropdown");
    if (menu) menu.open = false;
    button.disabled = true;
    try {
      const { notifications } = await api("/item-outcome-notifications");
      setOutcomeNotificationCount(notifications.length);
      showOutcomeNotificationsDialog(notifications);
    } catch (error) {
      errorDialog(error);
    } finally {
      button.disabled = false;
    }
  });
  app
    .querySelectorAll("[data-logout]")
    .forEach((button) => (button.onclick = () => logout(button)));
  if (state.user?.role === "admin") app.querySelectorAll("[data-add-admin]").forEach(button => button.onclick = () => {
    const menu = app.querySelector(".profile-dropdown");
    if (menu) {
      menu.open = false;
      menu.querySelector("summary").focus();
    }
    showAdminRegistration();
  });
  app.onclick = event => {
    const menu = app.querySelector(".profile-dropdown");
    if (menu?.open && !menu.contains(event.target)) menu.open = false;
  };
  app.onkeydown = event => {
    const menu = app.querySelector(".profile-dropdown");
    if (event.key === "Escape" && menu?.open) {
      menu.open = false;
      menu.querySelector("summary").focus();
      event.preventDefault();
    }
  };
}
function setOutcomeNotificationCount(count) {
  const safeCount = Number.isSafeInteger(count) && count >= 0 ? count : 0;
  state.outcomeNotificationCount = safeCount;
  app.querySelectorAll("[data-notification-count]").forEach((badge) => {
    badge.textContent = String(safeCount);
  });
}
function refreshOutcomeNotificationCount() {
  api("/item-outcome-notifications")
    .then(({ notifications }) => setOutcomeNotificationCount(Array.isArray(notifications) ? notifications.length : 0))
    .catch(() => {});
}
async function logout(button) {
  button.disabled = true;
  try {
    await api("/logout", { method: "POST" });
  } catch (error) {
    // An expired session is already signed out. Network failures must remain retryable.
    if (error.handled) return;
    if (error.status !== 401) {
      button.disabled = false;
      errorDialog(error);
      return;
    }
  }
  clearSession();
  state.role = "student";
  try {
    sessionStorage.removeItem("retorno-role");
  } catch {}
  go("role", { replace: true });
}
function passwordMagnifier(visible) {
  return `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="13" cy="13" r="9" fill="${visible ? "#fff" : "currentColor"}" stroke="currentColor" stroke-width="3"/><path d="m20 20 4 4" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`;
}
function authField(
  name,
  label,
  type,
  css = "",
  autocomplete = "",
  togglePassword = false,
) {
  const input = `<input class="pill" id="${name}" name="${name}" type="${type}" ${type === "password" ? 'minlength="8" maxlength="128"' : ""} ${type === "email" ? 'maxlength="254"' : ""} ${name === "fullName" ? 'maxlength="100"' : ""} required autocomplete="${autocomplete}">`;
  const control = togglePassword
    ? `<div class="password-entry">${input}<button class="password-toggle" type="button" data-toggle-password="${name}" aria-label="Show password" aria-pressed="false">${passwordMagnifier(false)}</button></div>`
    : input;
  return `<div class="auth-field ${css}">${control}<label for="${name}">${label}</label></div>`;
}
function authScreen(register = false) {
  register = register && state.role === "student";
  const switcher = state.role === "student" ? `<nav class="auth-switcher pill" role="tablist" aria-label="Student account"><button type="button" role="tab" id="login-tab" aria-selected="${!register}" aria-controls="auth-form" data-go="login">Log in</button><span aria-hidden="true">|</span><button type="button" role="tab" id="register-tab" aria-selected="${register}" aria-controls="auth-form" data-go="register">Register</button></nav>` : "";
  app.innerHTML = `<section class="screen ${register ? "registration" : "login"}">${backButton("role", "Back to role selection", "auth-back")}<img class="auth-logo" src="assets/logo.png" alt="RETURNO">${switcher}<form id="auth-form" ${state.role === "student" ? `role="tabpanel" aria-labelledby="${register ? "register-tab" : "login-tab"}"` : ""}>${register ? authField("email", "Enter gmail", "email", "field-0", "email") + authField("fullName", "Full name", "text", "field-1", "name") + authField("password", "Set password", "password", "field-2", "new-password", true) + authField("confirmPassword", "Confirm password", "password", "field-3", "new-password", true) + '<label class="policy-agreement"><input type="checkbox" name="policyAgreement" required> <span>I agree to the <a href="terms.html" data-policy-link>Terms &amp; Conditions</a> and acknowledge the <a href="privacy.html" data-policy-link>Privacy Policy</a>.</span></label><button class="pill login-button" type="submit">Register</button>' : authField("email", "Email", "email", "email-field", "email") + authField("password", "Password", "password", "password-field", "current-password", true) + '<button class="pill login-button" type="submit">Log In</button>' + '<button class="forgot-password-link" type="button" data-go="forgot-password">Forgot password?</button>'}<p class="error auth-error" id="auth-error" role="alert"></p></form></section>`;
  bindNavigation();
  if (state.role === "student") {
    const tabs = app.querySelector(".auth-switcher");
    tabs.onkeydown = event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const route = event.key === "Home" ? "login" : event.key === "End" ? "register" : register ? "login" : "register";
      go(route);
      document.getElementById(route + "-tab").focus();
    };
    let start;
    const screen = app.querySelector(".screen");
    screen.addEventListener?.("touchstart", event => {
      start = event.touches.length === 1 && !event.target.closest("input, textarea") ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    }, { passive: true });
    screen.addEventListener?.("touchend", event => {
      if (!start || event.changedTouches.length !== 1) return;
      const dx = event.changedTouches[0].clientX - start.x;
      const dy = event.changedTouches[0].clientY - start.y;
      start = null;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0 && !register) go("register");
      if (dx > 0 && register) go("login");
    }, { passive: true });
    screen.addEventListener?.("touchcancel", () => { start = null; }, { passive: true });
  }
  app.querySelectorAll("[data-toggle-password]").forEach(
    (toggle) =>
      (toggle.onclick = () => {
        const input = document.getElementById(toggle.dataset.togglePassword),
          visible = input.type === "password";
        input.type = visible ? "text" : "password";
        toggle.innerHTML = passwordMagnifier(visible);
        toggle.setAttribute(
          "aria-label",
          visible ? "Hide password" : "Show password",
        );
        toggle.setAttribute("aria-pressed", String(visible));
        input.focus();
      }),
  );
  document.querySelector("#auth-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      button = form.querySelector("[type=submit]");
    const data = Object.fromEntries(new FormData(form));
    data.role = state.role;
    if (register) data.policyAgreement = form.elements.policyAgreement.checked;
    const output = document.querySelector("#auth-error");
    output.textContent = "";
    if (register && data.password !== data.confirmPassword)
      return errorAt(output, "Passwords do not match.");
    button.disabled = true;
    try {
      const result = await api(register ? "/register" : "/login", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (result.verificationRequired) return verificationScreen(result.email);
      state.user = result.user;
      state.role = result.user.role;
      try {
        sessionStorage.setItem("retorno-role", state.role);
      } catch {}
      state.filter = "All";
      go("feed");
    } catch (error) {
      errorAt(output, error);
      button.disabled = false;
    }
  };
}
function verificationScreen(email) {
  const version = renderVersion;
  app.innerHTML = `<main class="auth-page">${backButton("register", "Back to registration", "auth-back")}${logo}<h1>Confirm your email</h1><p>We've sent a code to your email. Check your inbox or spam folder. The code will expire after 10 minutes.</p><form id="verification-form"><label for="verification-code">Verification code</label><input class="pill" id="verification-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required><p id="verification-error" role="alert"></p><button class="pill" type="submit">Confirm email</button></form><button class="pill" id="verification-back">Request a new code</button></main>`;
  bindNavigation();
  document.querySelector("#verification-back").onclick = () => go("register");
  document.querySelector("#verification-form").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    const output = document.querySelector("#verification-error");
    output.textContent = "";
    button.disabled = true;
    try {
      const result = await api("/verify-email", {
        method: "POST",
        body: JSON.stringify({
          email,
          code: document.querySelector("#verification-code").value,
        }),
      });
      if (version !== renderVersion) return;
      state.user = result.user;
      state.role = result.user.role;
      try {
        sessionStorage.setItem("retorno-role", state.role);
      } catch {}
      go("feed");
    } catch (error) {
      if (version !== renderVersion) return;
      errorAt(output, error);
      button.disabled = false;
    }
  };
  document.querySelector("#verification-code").focus();
}
function passwordRecoveryScreen(email = "") {
  const version = renderVersion;
  const resetting = Boolean(email);
  app.innerHTML = `<main class="auth-page ${resetting ? "password-reset" : "password-recovery"}">${backButton("login", "Back to log in", "auth-back")}${logo}${resetting ? '<h1>Reset password</h1><p>If this email belongs to a RETURNO account, a reset code will be sent. Check your inbox and spam folder. It expires in 10 minutes. Wait one minute before requesting another code. If no email arrives, contact the administrator.</p>' : ""}<form id="recovery-form">${resetting ? '<label for="reset-code">Reset code</label><input class="pill" id="reset-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>' + authField("password", "New password", "password", "", "new-password") + authField("confirmPassword", "Confirm new password", "password", "", "new-password") : authField("email", "Enter your registered email", "email", "", "email")}<p class="error" id="recovery-error" role="alert"></p><button type="submit" class="${resetting ? "pill" : "send-reset-code"}">${resetting ? "Change password" : "Send reset code"}</button></form>${resetting ? '<button type="button" class="pill" id="resend-reset">Request another code</button>' : ""}</main>`;
  bindNavigation();
  if (resetting) document.querySelector("#resend-reset").onclick = () => passwordRecoveryScreen();
  document.querySelector("#recovery-form").onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("[type=submit]");
    const output = document.querySelector("#recovery-error");
    const data = Object.fromEntries(new FormData(form));
    if (resetting) data.email = email;
    output.textContent = "";
    if (resetting && data.password !== data.confirmPassword) return errorAt(output,"Passwords do not match.");
    button.disabled = true;
    try {
      await api(resetting ? "/reset-password" : "/forgot-password", { method: "POST", body: JSON.stringify(data) });
      if (version !== renderVersion || !form.isConnected) return;
      if (!resetting) return passwordRecoveryScreen(data.email);
      clearSession();
      go("login", { replace: true });
      document.querySelector("#auth-error").textContent = "Password changed. Please log in with your new password.";
    } catch (error) {
      if (version !== renderVersion || !form.isConnected) return;
      errorAt(output,error);
      button.disabled = false;
    }
  };
  document.querySelector(resetting ? "#reset-code" : "#email").focus();
}
function itemImage(post, css = "item-image") {
  return `<div class="${css}">${post.image ? `<img src="${esc(post.image)}" alt="${esc(post.item_name)}">` : "Image"}</div>`;
}
function dateText(value) {
  if (!value) return "";
  return value.replace("T", " ") + " PHT";
}
function postContact(post) {
  return post.contact_details || [post.contact_email, post.contact_phone].filter(Boolean).join(" / ") || "Not provided";
}
function fields(post, own = false) {
  return `<div class="card-data"><p class="card-item"><span class="card-label">Item name:</span> <strong>${esc(post.item_name)}</strong></p><p><span class="card-label">Date &amp; time ${post.kind === "Lost" ? "lost" : "found"}:</span> ${esc(dateText(post.event_at))}</p><p><span class="card-label">Location/Address:</span> ${esc(post.location)}</p><p><span class="card-label">Description:</span> ${esc(post.description)}</p></div>`;
}
function menu(post) {
  if (state.user?.role !== "admin") return "";
  return `<div class="menu" data-menu="${post.id}" hidden><button data-edit="${post.id}">Edit</button><button data-update="${post.id}">Update</button><button data-delete="${post.id}">Delete</button></div>`;
}
function card(post, own = false) {
  const manage = own && state.user?.role === "admin";
  const studentOwn = own && state.user?.role === "student";
  const active = ["Lost", "Found"].includes(post.status);
  const outcomePhrase = post.kind === "Lost" ? "claimed by its owner" : "returned to its owner";
  const studentActions = studentOwn
    ? `<div class="own-post-actions">${active ? (post.pending_outcome ? `<span class="outcome-pending" role="status">Admin notified: ${esc(outcomePhrase)} · awaiting review</span>` : `<button type="button" class="pill" data-notify-outcome="${esc(post.id)}">Notify admin: ${esc(outcomePhrase)}</button>`) : ""}</div>`
    : "";
  return `<article class="card" data-detail="${esc(post.id)}" role="${manage || studentOwn ? "group" : "button"}" tabindex="0" aria-label="${studentOwn ? `Your post: ${esc(post.item_name)}` : `View details for ${esc(post.item_name)}`} "><div class="card-head">${manage ? `<button class="more" data-more="${post.id}" aria-label="Post options" aria-expanded="false">•••</button>` : `<div class="author">Posted by:<strong>${esc(post.author)}</strong></div>`}<span class="status" data-status="${esc(post.status)}">${esc(post.status)}</span></div>${itemImage(post)}${fields(post, own)}<p class="card-contact"><span class="contact-heading">Contact me</span><span class="contact-preview">${esc(postContact(post))}</span></p>${studentActions}${manage ? menu(post) : ""}</article>`;
}
function adminPostRow(p) {
  return `<article class="admin-row">${itemImage(p, "row-image")}<button class="row-info" data-detail="${p.id}">Posted by:<strong>${esc(p.author)}</strong><small>Click to view more details</small></button><button class="more" data-more="${p.id}" aria-label="Post options" aria-expanded="false">⋮</button>${menu(p)}</article>`;
}
function outcomeNotificationPanel(notifications) {
  return `<section class="outcome-notifications" aria-labelledby="outcome-notifications-title"><div class="outcome-notifications-head"><h2 id="outcome-notifications-title" tabindex="-1">Student outcome notifications</h2><div class="outcome-notifications-tools"><span>${notifications.length}</span><button type="button" class="pill" data-refresh-outcome-notifications>Refresh</button></div></div>${notifications.length ? notifications.map((item) => {
    const outcomePhrase = item.kind === "Lost" ? "claimed by its owner" : "returned to its owner";
    return `<article class="outcome-notification" data-outcome-notification="${esc(item.id)}"><div><h3>${esc(item.item_name)}</h3><p><strong>${esc(item.student_name)}</strong> reported this ${esc(item.kind.toLowerCase())} item as <strong>${esc(outcomePhrase)}</strong>.</p><p class="outcome-notification-location">Location: ${esc(item.location)}</p><p>Current post status: ${esc(item.current_status)}</p>${item.has_proof ? `<img class="outcome-proof-image" src="/api/item-outcome-notifications/${encodeURIComponent(item.id)}/proof" alt="Student's proof image for ${esc(item.item_name)}" loading="lazy">` : '<p class="outcome-proof-missing">No proof image is attached. Dismiss this older request and ask the student to submit it again with proof.</p>'}<p class="error" role="alert"></p></div><div class="outcome-notification-actions">${item.has_proof ? `<button type="button" class="pill" data-review-status="${esc(item.outcome)}" aria-label="Set ${esc(item.outcome)} for ${esc(item.item_name)}" disabled>Set ${esc(item.outcome)}</button>` : ''}<button type="button" class="pill" data-review-status="Dismissed">Dismiss</button></div></article>`;
  }).join("") : '<p class="empty">No pending student notifications.</p>'}</section>`;
}
function renderOutcomeNotificationsDialog(notifications) {
  setOutcomeNotificationCount(notifications.length);
  dialog.innerHTML = `${outcomeNotificationPanel(notifications)}<div class="dialog-actions"><button type="button" data-close>Close</button></div>`;
  dialog.querySelector("[data-close]").onclick = dismissDialog;
  bindOutcomeNotifications();
}
function showOutcomeNotificationsDialog(notifications) {
  renderOutcomeNotificationsDialog(notifications);
  openDialog("Student outcome notifications");
  dialog.querySelector("h2").focus?.({ preventScroll: true });
}
function bindOutcomeNotifications() {
  dialog.querySelectorAll(".outcome-notification").forEach((row) => {
    const proof = row.querySelector(".outcome-proof-image");
    const confirm = row.querySelector('[data-review-status="Claimed"], [data-review-status="Returned"]');
    if (!proof || !confirm) return;
    const enableAfterLoad = () => { if (proof.naturalWidth > 0) confirm.disabled = false; };
    if (proof.complete) enableAfterLoad();
    else proof.addEventListener("load", enableAfterLoad, { once: true });
    proof.addEventListener("error", () => {
      row.querySelector("[role=alert]").textContent = "The proof image could not be loaded. Refresh the inbox before reviewing this request.";
    }, { once: true });
  });
  dialog.querySelector("[data-refresh-outcome-notifications]").onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const { notifications } = await api("/item-outcome-notifications");
      renderOutcomeNotificationsDialog(notifications);
      dialog.querySelector("[data-refresh-outcome-notifications]").focus();
    } catch (error) {
      errorDialog(error);
    }
  };
  dialog.querySelectorAll("[data-outcome-notification]").forEach((row) => {
    row.querySelectorAll("[data-review-status]").forEach((button) => {
      button.onclick = async () => {
        button.disabled = true;
        try {
          const { status } = await api(`/item-outcome-notifications/${encodeURIComponent(row.dataset.outcomeNotification)}`, {
            method: "PATCH",
            body: JSON.stringify({ status: button.dataset.reviewStatus }),
          });
          const { notifications } = await api("/item-outcome-notifications");
          renderOutcomeNotificationsDialog(notifications);
          if (location.hash === "#admin") admin(++renderVersion, state.adminStatus, state.adminPage).catch(errorDialog);
        } catch (error) {
          if (!row.isConnected) return;
          errorAt(row.querySelector("[role=alert]"), error);
          row.querySelectorAll("[data-review-status]").forEach((action) => { action.disabled = false; });
        }
      };
    });
  });
}
function postToolbar(filtersMarkup) {
  return `<div class="post-toolbar">${filtersMarkup}<button type="button" class="icon home-search" data-go="search" aria-label="Search">${searchIcon}</button></div>`;
}
function filters() {
  return postToolbar(`<nav class="filters" aria-label="Post type">${["All", "Lost", "Found"].map((x) => `<button data-filter="${x}" class="${state.filter === x ? "active" : ""}">${x.toUpperCase()}</button>`).join("")}</nav>`);
}
function openDialog(label) {
  dialog.setAttribute("aria-label", label);
  if (!dialog.open) {
    history.pushState({ ...(history.state || {}), retornoDialog: true }, "", location.href);
    dialogHistoryEntry = true;
    dialog.showModal();
  }
}
function dismissDialog() {
  if (!dialog.open) return;
  if (dialogHistoryEntry) {
    history.back();
    return;
  }
  dialog.close();
}
dialog.addEventListener("cancel", (event) => {
  if (!dialogHistoryEntry) return;
  event.preventDefault();
  dismissDialog();
});
dialog.addEventListener("close", () => {
  dialogHistoryEntry = false;
});
function errorDialog(error) {
  if (error.handled) return;
  dialog.innerHTML = `<p>${esc(error.message || error)}</p><div class="dialog-actions"><button data-close>Close</button></div>`;
  dialog.querySelector("[data-close]").onclick = dismissDialog;
  openDialog("Error");
}
function showDetails(id) {
  const post = state.posts.find((p) => p.id === id);
  if (!post) return;
  dialog.innerHTML = `<h2 tabindex="-1">${esc(post.item_name || "Item name")}</h2><div class="detail-layout">${post.image ? `<div class="detail-media"><img class="detail-image" src="${esc(post.image)}" alt="${esc(post.item_name)}"></div>` : ""}<div class="detail-column"><div class="detail-data"><p><span class="detail-label">Posted by:</span> ${esc(post.author)}</p><p><span class="detail-label">Status:</span> <span class="status" data-status="${esc(post.status)}">${esc(post.status)}</span></p><p><span class="detail-label">Date &amp; time ${post.kind === "Lost" ? "lost" : "found"}:</span> ${esc(dateText(post.event_at))}</p><p><span class="detail-label">Location/Address:</span> ${esc(post.location)}</p><p><span class="detail-label">Description:</span> ${esc(post.description)}</p></div><p class="detail-contact"><span class="contact-heading">Contact me</span><span class="detail-contact-value">${esc(postContact(post))}</span></p></div></div><div class="dialog-actions"><button data-close>Close</button></div>`;
  dialog.querySelector("[data-close]").onclick = dismissDialog;
  openDialog(post.item_name || "Item details");
  dialog.querySelector("h2").focus?.({ preventScroll: true });
  dialog.scrollTop = 0;
}
function showOutcomeNotificationDialog(post) {
  const pageVersion = renderVersion;
  const outcomePhrase = post.kind === "Lost" ? "claimed by its owner" : "returned to its owner";
  dialog.innerHTML = `<form id="outcome-notification-form"><h2>Notify administrator</h2><p>Tell an administrator that <strong>${esc(post.item_name)}</strong> was ${esc(outcomePhrase)}. This will not change the post status. An administrator will review the proof and set the final status.</p><label for="outcome-proof-file">Upload proof image (required)</label><input id="outcome-proof-file" type="file" accept="image/png,image/jpeg,image/webp" required><small>PNG, JPEG, or WebP up to 10 MB. Only administrators can view it. The image is deleted after the request is reviewed.</small><div id="outcome-proof-preview" class="outcome-proof-preview" aria-live="polite"></div><p class="error" role="alert"></p><div class="dialog-actions"><button type="button" data-close>Cancel</button><button type="submit">Send notification</button></div></form>`;
  let proofFile = null;
  let proofPreview = null;
  dialog.querySelector("[data-close]").onclick = () => {
    if (proofPreview?.startsWith("blob:")) URL.revokeObjectURL(proofPreview);
    dismissDialog();
  };
  const proofInput = dialog.querySelector("#outcome-proof-file");
  const preview = dialog.querySelector("#outcome-proof-preview");
  proofInput.onchange = () => {
    if (proofPreview?.startsWith("blob:")) URL.revokeObjectURL(proofPreview);
    proofFile = proofInput.files?.[0] || null;
    preview.replaceChildren();
    proofPreview = null;
    if (!proofFile) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(proofFile.type)) {
      proofInput.value = "";
      proofFile = null;
      return errorAt(dialog.querySelector("[role=alert]"), "Choose a PNG, JPEG, or WebP image.");
    }
    if (proofFile.size > 10 * 1024 * 1024) {
      proofInput.value = "";
      proofFile = null;
      return errorAt(dialog.querySelector("[role=alert]"), "Proof image must be 10 MB or smaller.");
    }
    if (state.directImageUpload) {
      proofPreview = URL.createObjectURL(proofFile);
      preview.innerHTML = `<img src="${esc(proofPreview)}" alt="Selected proof image preview">`;
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        proofPreview = reader.result;
        preview.innerHTML = `<img src="${esc(proofPreview)}" alt="Selected proof image preview">`;
      };
      reader.onerror = () => errorAt(dialog.querySelector("[role=alert]"), "Unable to read the proof image.");
      reader.readAsDataURL(proofFile);
    }
    dialog.querySelector("[role=alert]").textContent = "";
  };
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    if (!proofFile) return errorAt(form.querySelector("[role=alert]"), "Choose a proof image before sending the notification.");
    submit.disabled = true;
    try {
      let proof;
      if (state.directImageUpload) {
        const ticket = await api(`/posts/${encodeURIComponent(post.id)}/outcome-notifications/proof-upload-ticket`, {
          method: "POST",
          body: JSON.stringify({ contentType: proofFile.type, size: proofFile.size }),
        });
        const uploadBody = new FormData();
        uploadBody.append("cacheControl", "3600");
        uploadBody.append("", proofFile);
        const uploaded = await fetch(ticket.uploadUrl, {
          method: "PUT",
          headers: { "x-upsert": "false" },
          body: uploadBody,
        });
        if (!uploaded.ok) throw new Error("Proof upload failed. Please try again.");
        proof = { imageKey: ticket.path };
      } else {
        if (!proofPreview) throw new Error("Please wait for the proof image preview.");
        proof = { image: proofPreview };
      }
      await api(`/posts/${encodeURIComponent(post.id)}/outcome-notifications`, {
        method: "POST",
        body: JSON.stringify(proof),
      });
      if (proofPreview?.startsWith("blob:")) URL.revokeObjectURL(proofPreview);
      if (pageVersion !== renderVersion) return;
      dismissDialog();
      state.notice = "";
      feed(true, ++renderVersion, state.minePage);
    } catch (error) {
      if (pageVersion !== renderVersion || !form.isConnected) return;
      errorAt(form.querySelector("[role=alert]"), error);
      submit.disabled = false;
    }
  };
  openDialog("Notify administrator about item outcome");
  dialog.querySelector('[type="submit"]').focus();
}
function bindPostActions() {
  app.querySelectorAll("[data-detail]").forEach((card) => {
    if (!card.matches(".card")) {
      card.onclick = () => showDetails(card.dataset.detail);
      return;
    }
    card.onclick = (event) => {
      if (event.target.closest("button,a,input,select,textarea,.menu")) return;
      showDetails(card.dataset.detail);
    };
    card.onkeydown = (event) => {
      if (
        (event.key === "Enter" || event.key === " ") &&
        !event.target.closest("button,a,input,select,textarea,.menu")
      ) {
        event.preventDefault();
        showDetails(card.dataset.detail);
      }
    };
  });
  app.querySelectorAll("[data-notify-outcome]").forEach((button) => {
    button.onclick = () => {
      const post = state.posts.find((item) => item.id === button.dataset.notifyOutcome);
      if (post) showOutcomeNotificationDialog(post);
    };
  });
  if (state.user?.role !== "admin") return;
  app.querySelectorAll("[data-more]").forEach(
    (button) =>
      (button.onclick = () => {
        const target = app.querySelector(
            `[data-menu="${button.dataset.more}"]`,
          ),
          show = target.hidden;
        app.querySelectorAll("[data-menu]").forEach((x) => (x.hidden = true));
        app
          .querySelectorAll("[data-more]")
          .forEach((x) => x.setAttribute("aria-expanded", "false"));
        target.hidden = !show;
        button.setAttribute("aria-expanded", String(show));
      }),
  );
  app.querySelectorAll("[data-edit]").forEach(
    (button) =>
      (button.onclick = () => {
        state.edit = state.posts.find((p) => p.id === button.dataset.edit);
        state.back = location.hash.slice(1);
        go("post", { historyState: { retornoEditor: true } });
      }),
  );
  app.querySelectorAll("[data-update]").forEach(
    (button) =>
      (button.onclick = () => {
        const post = state.posts.find((p) => p.id === button.dataset.update);
        dialog.innerHTML = `<form id="update-form"><h2>Update</h2><label for="update-status">Status:</label><select id="update-status" name="status">${["Lost", "Found", "Claimed", "Returned"].map((s) => `<option ${s === post.status ? "selected" : ""}>${s}</option>`).join("")}</select><p class="error" role="alert"></p><div class="dialog-actions"><button type="button" data-close>Cancel</button><button>Update</button></div></form>`;
        dialog.querySelector("[data-close]").onclick = dismissDialog;
        dialog.querySelector("form").onsubmit = async (event) => {
          event.preventDefault();
          const submit = event.submitter;
          submit.disabled = true;
          try {
            await api("/posts/" + post.id, {
              method: "PATCH",
              body: JSON.stringify({
                status: dialog.querySelector("select").value,
              }),
            });
            dismissDialog();
            await render();
          } catch (e) {
            errorAt(dialog.querySelector(".error"), e);
            submit.disabled = false;
          }
        };
        openDialog("Update post status");
      }),
  );
  app.querySelectorAll("[data-delete]").forEach(
    (button) =>
      (button.onclick = () => {
        const id = button.dataset.delete;
        dialog.innerHTML =
          '<h2>Delete post?</h2><p class="error" role="alert"></p><div class="dialog-actions"><button data-close>Cancel</button><button data-confirm>Delete</button></div>';
        dialog.querySelector("[data-close]").onclick = dismissDialog;
        dialog.querySelector("[data-confirm]").onclick = async (event) => {
          event.currentTarget.disabled = true;
          try {
            await api("/posts/" + id, { method: "DELETE" });
            dismissDialog();
            await render();
          } catch (e) {
            errorAt(dialog.querySelector(".error"), e);
            dialog.querySelector("[data-confirm]").disabled = false;
          }
        };
        openDialog("Delete post");
      }),
  );
}
function listLoading(message) {
  state.posts = [];
  app.innerHTML = `<section class="screen page">${header()}<p class="empty" role="status" aria-live="polite" aria-busy="true">${esc(message)}</p></section>`;
  bindNavigation();
  bindPostActions();
}
function listFailure(error, version, retry) {
  if (error.handled || version !== renderVersion) return;
  app.innerHTML = `<section class="screen page">${header()}<div class="list-feedback"><p role="alert">${esc(error.message || error)}</p><button type="button" class="pill" data-retry-list>Retry</button></div></section>`;
  bindNavigation();
  bindPostActions();
  app.querySelector("[data-retry-list]").onclick = retry;
}
function pagination(meta) {
  if (!meta || meta.totalPages <= 1) return "";
  return '<nav class="pagination" aria-label="Post pages"><button type="button" class="pill" data-page="' + (meta.page - 1) + '" ' + (meta.page === 1 ? 'disabled' : '') + '>Previous</button><span aria-live="polite">Page ' + meta.page + ' of ' + meta.totalPages + '</span><button type="button" class="pill" data-page="' + (meta.page + 1) + '" ' + (meta.page === meta.totalPages ? 'disabled' : '') + '>Next</button></nav>';
}
function bindPagination(load) {
  app.querySelectorAll("[data-page]").forEach(button => button.onclick = () => load(Number(button.dataset.page)));
}
function showAccountDeletionDialog(request, pageVersion, deletionButton) {
  const cancelling = Boolean(request);
  dialog.innerHTML = `<form id="account-deletion-request-form"><h2>${cancelling ? "Cancel deletion request?" : "Request account deletion?"}</h2><p>${cancelling ? `Your request, submitted ${esc(request.requestedAt)}, is pending administrator review. You can cancel it here.` : "This sends a request to an administrator; it does not delete your account now. If an administrator approves it, all your posts and sessions will be deleted with your account."}</p><p class="error" role="alert"></p><div class="dialog-actions"><button type="button" data-close>Keep account</button><button type="submit">${cancelling ? "Cancel request" : "Send request"}</button></div></form>`;
  dialog.querySelector("[data-close]").onclick = () => {
    dismissDialog();
  };
  dialog.querySelector("form").onsubmit = async event => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('[type="submit"]');
    const output = dialog.querySelector('[role="alert"]');
    submit.disabled = true;
    try {
      await api("/account-deletion-request", { method: cancelling ? "DELETE" : "POST", ...(cancelling ? {} : { body: JSON.stringify({}) }) });
      if (pageVersion !== renderVersion) return;
      if (deletionButton) deletionButton.textContent = cancelling ? "Request account deletion" : "Cancel account deletion request";
      dismissDialog();
      const menu = app.querySelector(".profile-dropdown");
      if (menu) menu.open = false;
    } catch (error) {
      if (pageVersion !== renderVersion || !dialog.open) return;
      errorAt(output, error);
      submit.disabled = false;
    }
  };
  openDialog(cancelling ? "Cancel deletion request" : "Request account deletion");
}
async function feed(own, version, page = own ? state.minePage : 1) {
  const params = new URLSearchParams({page: String(page), pageSize: "28"});
  if (own) params.set("mine", "1");
  else if (state.filter !== "All") params.set("kind", state.filter);
  listLoading(own ? "Loading your posts..." : "Loading posts...");
  let posts, meta;
  try {
    ({ posts, pagination: meta } = await api("/posts?" + params));
  } catch (error) {
    listFailure(error, version, () => feed(own, ++renderVersion, page));
    return;
  }
  if (version !== renderVersion) return;
  state.posts = posts;
  app.innerHTML = `<section class="screen page ${own ? "own" : "student-home"}">${header(!own)}${state.notice ? `<p class="success-notice" role="status">${esc(state.notice)}</p>` : ""}${own ? '<h2 class="own-title">Your post</h2>' : filters()}<div class="cards">${posts.map((p) => card(p, own)).join("")}${own ? '<button class="card add-card" id="add-post" aria-label="Add post">+</button>' : ""}</div>${pagination(meta)}${!posts.length ? `<p class="empty" role="status">${own ? "You have not posted any items yet. Use Add post to report an item." : "No posts match this filter."}</p>` : ""}</section>`;
  state.notice = "";
  bindNavigation();
  bindPostActions();
  bindPagination(next => {
    if (own) state.minePage = next;
    feed(own, ++renderVersion, next);
  });
  if (own)
    document.querySelector("#add-post").onclick = () => {
      state.edit = null;
      state.back = location.hash.slice(1) || "mine";
      go("post", { historyState: { retornoEditor: true } });
    };
  app.querySelectorAll("[data-filter]").forEach(
    (el) =>
      (el.onclick = () => {
        state.filter = el.dataset.filter;
        render();
      }),
  );
}
function editor() {
  const pageVersion = renderVersion;
  let imageVersion = 0;
  const post = state.user?.role === "admin" ? state.edit : null;
  let kind = post?.kind || "",
    image = post?.image || null,
    selectedFile = null,
    reading = false,
    saving = false;
  app.innerHTML = `<section class="screen editor"><form class="editor-panel" id="post-form"><div class="editor-head"><button type="button" class="editor-logo" data-go="${state.user.role === "admin" ? state.back : "feed"}" aria-label="Home">${logo}</button><div class="editor-actions"><button type="button" class="pill cancel-post-button" data-cancel-post>Cancel</button><button class="pill post-button" type="submit">${post ? "Update" : "Post"}</button></div></div><label class="upload-area" id="upload-area"><span id="upload-preview">${image ? `<img src="${esc(image)}" alt="Selected item">` : "Upload your image here"}</span><input type="file" id="image-input" accept="image/png,image/jpeg,image/webp" aria-label="Upload your image here"></label><div class="post-fields"><div class="post-field status-field"><span>Status:</span><button id="status-trigger" class="pill status-trigger" type="button" aria-expanded="false" aria-controls="status-options"><span id="chosen-kind">${kind}</span><span class="triangle"></span></button><div class="status-options" id="status-options" hidden><button type="button" data-kind="Lost">Lost</button><button type="button" data-kind="Found">Found</button></div></div><label class="post-field"><span>Item name:</span><input name="item_name" required maxlength="200" value="${esc(post?.item_name)}"></label><label class="post-field"><span id="event-time-label">${kind ? `Date time ${kind.toLowerCase()}:` : "Date time:"}</span><input name="event_at" type="datetime-local" required value="${esc(post?.event_at)}"></label><label class="post-field"><span>Location/Address :</span><input name="location" required maxlength="500" value="${esc(post?.location)}"></label><div class="contact-methods"><span>How to contact you (optional):</span><div class="contact-box"><div id="contact-rows"></div><button type="button" id="add-contact">Add contact method</button></div></div><p class="contact-note">What you enter here will appear on your home post.</p><label class="post-field"><span>Description:</span><textarea name="description" required maxlength="3000">${esc(post?.description)}</textarea></label></div><p id="post-status" role="status" aria-live="polite"></p><p id="post-error" class="error" role="alert"></p></form></section>`;
  bindNavigation();
  const leaveEditor = () => {
    state.edit = null;
    if (history.state?.retornoEditor) history.back();
    else go(state.user.role === "admin" && state.back === "mine" ? "admin-profile" : state.back || "mine", { replace: true });
  };
  app.querySelector(".editor-logo").onclick = leaveEditor;
  const cancelPost = () => {
    leaveEditor();
  };
  document.querySelector("[data-cancel-post]").onclick = cancelPost;
  const options = document.querySelector("#status-options"),
    trigger = document.querySelector("#status-trigger"),
    output = document.querySelector("#post-error");
  trigger.onclick = () => {
    options.hidden = !options.hidden;
    trigger.setAttribute("aria-expanded", String(!options.hidden));
  };
  app.querySelectorAll("[data-kind]").forEach(
    (el) =>
      (el.onclick = () => {
        kind = el.dataset.kind;
        document.querySelector("#chosen-kind").textContent = kind;
        document.querySelector("#event-time-label").textContent = `Date time ${kind.toLowerCase()}:`;
        options.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }),
  );
  const contactRows = document.querySelector("#contact-rows");
  let contactIndex = 0;
  const navigationClick = app.onclick;
  app.onclick = event => {
    navigationClick?.(event);
    contactRows.querySelectorAll(".contact-picker").forEach(picker => {
      if (!picker.contains(event.target)) {
        picker.querySelector(".contact-options").hidden = true;
        picker.querySelector(".contact-trigger").setAttribute("aria-expanded", "false");
      }
    });
  };
  function addContact(method = "Facebook", value = "") {
    const row = document.createElement("div");
    row.className = "contact-method-row";
    const methods = ["Facebook", "Contact number", "Gmail", "Other"];
    const optionsId = "contact-options-" + ++contactIndex;
    row.innerHTML = '<select hidden aria-hidden="true" tabindex="-1">' + methods.map(name => '<option>' + name + '</option>').join("") + '</select><div class="contact-picker"><button type="button" class="pill status-trigger contact-trigger" aria-label="Contact method" aria-expanded="false" aria-controls="' + optionsId + '"><span class="contact-choice">' + esc(method) + '</span><span class="triangle" aria-hidden="true"></span></button><div class="status-options contact-options" id="' + optionsId + '" hidden>' + methods.map(name => '<button type="button" data-contact-choice="' + name + '">' + name + '</button>').join("") + '</div></div><input aria-label="How to contact you (optional):" maxlength="500"><button type="button" class="pill" data-remove-contact aria-label="Remove contact method">Remove</button>';
    const select = row.querySelector("select"), input = row.querySelector("input");
    select.value = method;
    input.value = value;
    const updateHint = () => { input.placeholder = "Type here"; };
    select.onchange = updateHint;
    updateHint();
    const picker = row.querySelector(".contact-picker"), trigger = row.querySelector(".contact-trigger"), options = row.querySelector(".contact-options");
    const choices = Array.from(row.querySelectorAll("[data-contact-choice]"));
    const close = () => { options.hidden = true; trigger.setAttribute("aria-expanded", "false"); };
    const open = () => {
      contactRows.querySelectorAll(".contact-trigger").forEach(other => {
        if (other !== trigger) {
          other.setAttribute("aria-expanded", "false");
          other.parentElement.querySelector(".contact-options").hidden = true;
        }
      });
      options.hidden = false; trigger.setAttribute("aria-expanded", "true");
      (choices.find(choice => choice.dataset.contactChoice === select.value) || choices[0])?.focus();
    };
    trigger.onclick = () => options.hidden ? open() : close();
    choices.forEach(choice => choice.onclick = () => {
      select.value = choice.dataset.contactChoice;
      row.querySelector(".contact-choice").textContent = select.value;
      updateHint(); close(); trigger.focus();
    });
    picker.onkeydown = event => {
      if (event.key === "Escape") { close(); trigger.focus(); event.preventDefault(); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        if (options.hidden) return open();
        const index = choices.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
        choices[next]?.focus();
      }
    };
    picker.onfocusout = () => setTimeout(() => { if (!picker.contains(document.activeElement)) close(); }, 0);
    row.querySelector("[data-remove-contact]").onclick = () => row.remove();
    contactRows.append(row);
  }
  const savedContact = post?.contact_details || [post?.contact_email, post?.contact_phone].filter(Boolean).join(" / ");
  if (savedContact) {
    savedContact.split("\n").forEach(line => {
      const match = /^(Facebook|Contact number|Gmail|Other): (.*)$/.exec(line);
      addContact(match ? match[1] : "Other", match ? match[2] : line);
    });
  } else addContact();
  document.querySelector("#add-contact").onclick = () => {
    addContact();
    contactRows.lastElementChild.querySelector(".contact-trigger").focus();
  };
  document.querySelector("#image-input").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const version = ++imageVersion;
    reading = false;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      event.target.value = "";
      return errorAt(
        output,
        "Use a PNG, JPEG, or WebP image 10 MB or smaller.",
      );
    }
    reading = true;
    selectedFile = file;
    output.textContent = "";
    try {
      const selectedImage = state.directImageUpload
        ? URL.createObjectURL(file)
        : await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Unable to read image."));
        reader.readAsDataURL(file);
      });
      if (version !== imageVersion || pageVersion !== renderVersion) return;
      image = selectedImage;
      document.querySelector("#upload-preview").innerHTML =
        `<img src="${esc(image)}" alt="Selected item">`;
    } catch (e) {
      if (version === imageVersion && pageVersion === renderVersion)
        errorAt(output, e);
    } finally {
      if (version === imageVersion && pageVersion === renderVersion)
        reading = false;
    }
  };
  document.querySelector("#post-form").onsubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    output.textContent = "";
    if (!kind) return errorAt(output, "Select Lost or Found.");
    if (reading) return errorAt(output, "Please wait for the image.");
    const contacts = [...contactRows.children].map(row => {
      const value = row.querySelector("input").value.trim();
      return value ? row.querySelector("select").value + ": " + value : "";
    }).filter(Boolean).join("\n");
    if (contacts.length > 500) return errorAt(output, "Keep all contact details within 500 characters.");
    const data = {
      ...Object.fromEntries(new FormData(event.currentTarget)),
      contact_details: contacts,
      kind,
    };
    if (!state.directImageUpload) data.image = image;
    if (post)
      data.status = ["Lost", "Found"].includes(post.status)
        ? kind
        : post.status;
    const button = event.submitter || document.querySelector(".post-button");
    saving = true;
    button.disabled = true;
    button.textContent = "Saving...";
    document.querySelector("#post-form").setAttribute("aria-busy", "true");
    document.querySelector("#post-status").textContent = "Saving your post...";
    try {
      if (state.directImageUpload && selectedFile) {
        const ticket = await api("/report-images/upload-ticket", {
          method: "POST",
          body: JSON.stringify({ contentType: selectedFile.type, size: selectedFile.size }),
        });
        const uploadBody = new FormData();
        uploadBody.append("cacheControl", "3600");
        uploadBody.append("", selectedFile);
        const uploaded = await fetch(ticket.uploadUrl, {
          method: "PUT",
          headers: { "x-upsert": "false" },
          body: uploadBody,
        });
        if (!uploaded.ok) throw new Error("Image upload failed. Please try again.");
        data.imageKey = ticket.path;
      }
      await api("/posts" + (post ? "/" + post.id : ""), {
        method: post ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      if (pageVersion !== renderVersion) return;
      state.notice = post ? "Post updated successfully." : "Post published successfully.";
      state.edit = null;
      if (state.user.role === "admin" && history.state?.retornoEditor) {
        history.back();
      } else {
        state.filter = "All";
        if (!(state.user.role === "admin" && state.back === "search")) state.query = "";
        go(state.user.role === "admin" ? state.back : "feed", { replace: true });
      }
    } catch (e) {
      if (pageVersion !== renderVersion) return;
      errorAt(output, e);
      saving = false;
      button.disabled = false;
      button.textContent = post ? "Update" : "Post";
      document.querySelector("#post-form").setAttribute("aria-busy", "false");
      document.querySelector("#post-status").textContent = "";
    }
  };
}
function showAdminRegistration() {
  dialog.innerHTML = `<form id="admin-register-form"><h2>Register another admin</h2><label>Email<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>Full name<input name="fullName" required maxlength="100" autocomplete="name"></label><label>Password<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><label>Confirm password<input name="confirmPassword" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><p class="error" role="alert"></p><div class="dialog-actions"><button type="button" data-close>Cancel</button><button type="submit">Register admin</button></div></form>`;
  dialog.querySelector("[data-close]").onclick = dismissDialog;
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      submit = event.submitter,
      output = dialog.querySelector(".error");
    const data = Object.fromEntries(new FormData(form));
    output.textContent = "";
    if (data.password !== data.confirmPassword) {
      errorAt(output, "Passwords do not match.");
      return;
    }
    submit.disabled = true;
    try {
      await api("/admins", { method: "POST", body: JSON.stringify(data) });
      dismissDialog();
    } catch (error) {
      errorAt(output, error);
      submit.disabled = false;
    }
  };
  openDialog("Register another admin");
}
async function admin(version, status = state.adminStatus, page = state.adminPage) {
  listLoading("Loading dashboard...");
  let result, totals;
  try {
    [result, totals] = await Promise.all([
      api("/posts?page=" + page + "&pageSize=28" + (status ? "&status=" + status : "")),
      api("/stats"),
    ]);
  } catch (error) {
    listFailure(error, version, () => admin(++renderVersion, status, page));
    return;
  }
  if (version !== renderVersion) return;
  state.posts = result.posts;
  app.innerHTML = `<section class="screen page admin">${header()}${state.notice ? `<p class="success-notice" role="status">${esc(state.notice)}</p>` : ""}${postToolbar(`<nav class="filters admin-status-filters" aria-label="Report status">${["", "Lost", "Found", "Returned", "Claimed"].map((value) => `<button type="button" data-admin-filter="${value}" aria-label="${value || "All"}" class="${status === value ? "active" : ""}" aria-pressed="${status === value}">${value || "All"} <span class="filter-count">(${value ? totals.stats[value] : ["Lost", "Found", "Returned", "Claimed"].reduce((sum, key) => sum + totals.stats[key], 0)})</span>`).join("")}</nav>`)}<div class="admin-list">${result.posts.map(adminPostRow).join("")}</div>${pagination(result.pagination)}</section>`;
  bindPagination(next => {
    state.adminPage = next;
    admin(++renderVersion, status, next);
  });
  state.notice = "";
  bindNavigation();
  refreshOutcomeNotificationCount();
  bindPostActions();
  if (!result.posts.length)
    app.querySelector(".admin-list").innerHTML =
      `<p class="empty" role="status">${status ? `No ${esc(status.toLowerCase())} posts.` : "No reports have been posted yet."}</p>`;
  app
    .querySelectorAll("[data-admin-filter]")
    .forEach(
      (el) =>
        (el.onclick = () => {
          state.adminStatus = el.dataset.adminFilter;
          state.adminPage = 1;
          admin(++renderVersion, state.adminStatus, 1).catch(errorDialog);
        }),
    );
}
async function adminProfile(version) {
  listLoading("Loading admin profile...");
  let result;
  try {
    result = await api("/users");
  } catch (error) {
    listFailure(error, version, () => adminProfile(++renderVersion));
    return;
  }
  if (version !== renderVersion) return;
  const group = (role, title) => {
    const users = result.users.filter((user) => user.role === role).sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, {sensitivity:"base"}) || a.email.localeCompare(b.email));
    return `<section class="registered-users" aria-label="${title}"><div class="registered-users-head"><h3>${title}</h3><span>${users.length}</span></div><div class="registered-user-list">${users.map((user) => `<article class="registered-user" data-user-search="${esc(user.full_name + " " + user.email)}"><strong>${esc(user.full_name)}</strong><span class="registered-user-email">${esc(user.email)}${user.deletion_requested_at ? `<small class="deletion-request-status">Account deletion requested · ${esc(user.deletion_requested_at)}</small>` : ""}</span><div class="registered-user-actions"><span class="registered-user-role">${role === "admin" ? "Admin" : "Student"}</span>${user.id !== state.user.id ? `<button type="button" class="pill delete-account" data-delete-account="${esc(user.id)}" aria-label="Delete account for ${esc(user.email)}">Delete account</button>` : ""}</div></article>`).join("") || '<p class="empty">No registered users yet.</p>'}</div></section>`;
  };
  app.innerHTML = `<section class="screen page admin-profile">${header(false)}<h2>Registered users</h2><label class="user-search">Search registered users<input type="search" id="user-search" placeholder="Search by name or email" maxlength="254"></label><p id="user-filter-status" role="status" aria-live="polite"></p><div class="user-groups">${group("admin", "Admin users")}${group("student", "Student users")}</div></section>`;
  document.querySelector("#user-search").oninput = event => {
    const q = event.target.value.trim().toLowerCase();
    let count = 0;
    app.querySelectorAll(".registered-users").forEach(group => {
      let visible = 0;
      group.querySelectorAll("[data-user-search]").forEach(row => {
        row.hidden = !row.dataset.userSearch.toLowerCase().includes(q);
        if (!row.hidden) visible++;
      });
      group.querySelector(".registered-users-head > span").textContent = visible;
      count += visible;
    });
    document.querySelector("#user-filter-status").textContent = q ? count + " matching users." : "";
  };
  bindNavigation();
  refreshOutcomeNotificationCount();
  bindPostActions();
  app.querySelectorAll("[data-delete-account]").forEach(button => {
    button.onclick = () => {
      const target = result.users.find(user => user.id === button.dataset.deleteAccount);
      dialog.innerHTML = `<h2>Delete account?</h2><p>Delete ${esc(target.full_name)} (${esc(target.email)})? All their reports will be permanently deleted, and they will be signed out everywhere.</p><form id="delete-account-form"><label for="delete-account-email">Type the account email to confirm</label><input id="delete-account-email" type="email" maxlength="254" required autocomplete="off" class="pill"><p class="error" role="alert"></p><div class="dialog-actions"><button type="button" data-close>Cancel</button><button type="submit">Delete account</button></div></form>`;
      dialog.querySelector("[data-close]").onclick = dismissDialog;
      dialog.querySelector("#delete-account-form").onsubmit = async event => {
        event.preventDefault();
        const submit = event.currentTarget.querySelector("[type=submit]");
        const output = dialog.querySelector(".error");
        submit.disabled = true;
        output.textContent = "";
        try {
          await api("/users/" + target.id, { method: "DELETE", body: JSON.stringify({ confirmEmail: dialog.querySelector("#delete-account-email").value }) });
          if (version !== renderVersion) return;
          dismissDialog();
          await render();
        } catch (error) {
          if (version !== renderVersion || !dialog.open) return;
          errorAt(output, error);
          submit.disabled = false;
        }
      };
      openDialog("Delete account");
      dialog.querySelector("#delete-account-email").focus();
    };
  });
}
function searchPage() {
  const pageVersion = renderVersion;
  const suggestions = () =>
    `<h2>What are you looking for?</h2><div class="categories">${["Wallet", "Key", "Phone", "Tumbler", "ID", "Bracelet"].map((x) => `<button class="category" data-category="${x}"><img src="assets/${x.toLowerCase()}.png" alt=""><span>${x}</span></button>`).join("")}</div>`;
  app.innerHTML = `<section class="screen page search-page">${header(false, false)}<form id="search-form" class="search-box pill"><button class="icon" aria-label="Search">${searchIcon}</button><input name="q" type="search" maxlength="200" placeholder="Search items" aria-label="Search posts" value="${esc(state.query)}"><button type="button" class="search-clear" aria-label="Clear search" ${state.query ? "" : "hidden"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></form><section class="search-history" aria-label="Search history"><div class="history-heading"><h2>History</h2><button type="button" id="clear-history">Clear history</button></div><div id="history-entries"></div></section><div id="search-content">${suggestions()}</div></section>`;
  bindNavigation();
  let searchVersion = 0,
    timer;
  const content = document.querySelector("#search-content");
  const clearSearch = document.querySelector(".search-clear");
  const historyPanel = document.querySelector(".search-history");
  historyPanel.hidden = Boolean(state.query.trim());
  const clearHistory = document.querySelector("#clear-history");
  const paintHistory = () => {
    const entries = document.querySelector("#history-entries");
    clearHistory.hidden = !state.searchHistory.length;
    entries.innerHTML = state.searchHistory.map((q, index) => `<div class="history-item"><button type="button" class="history-entry" data-history-search="${index}">${esc(q)}</button><button type="button" class="history-remove" data-history-remove="${index}" aria-label="Remove ${esc(q)} from search history">&times;</button></div>`).join("") || '<p class="empty">No recent searches.</p>';
    entries.querySelectorAll("[data-history-search]").forEach(button => button.onclick = () => run(state.searchHistory[Number(button.dataset.historySearch)], 1, true));
    entries.querySelectorAll("[data-history-remove]").forEach(button => button.onclick = () => {
      const index = Number(button.dataset.historyRemove);
      state.searchHistory.splice(index, 1);
      paintHistory();
      const next = entries.querySelectorAll(".history-remove");
      (next[Math.min(index, next.length - 1)] || app.querySelector("[name=q]")).focus();
    });
  };
  clearHistory.onclick = () => {
    state.searchHistory = [];
    paintHistory();
    app.querySelector("[name=q]").focus();
  };
  const showSuggestions = () => {
    historyPanel.hidden = false;
    clearTimeout(timer);
    ++searchVersion;
    state.query = "";
    clearSearch.hidden = true;
    state.posts = [];
    content.setAttribute("aria-busy", "false");
    content.innerHTML = suggestions();
    app
      .querySelectorAll("[data-category]")
      .forEach((el) => (el.onclick = () => run(el.dataset.category, 1, true)));
  };
  const run = async (value, page = 1, remember = false) => {
    if (pageVersion !== renderVersion) return;
    clearTimeout(timer);
    const q = value.trim();
    state.query = q;
    if (!q) {
      showSuggestions();
      return;
    }
    const version = ++searchVersion;
    state.searchPage = page;
    historyPanel.hidden = true;
    app.querySelector("[name=q]").value = value;
    clearSearch.hidden = false;
    state.posts = [];
    content.setAttribute("aria-busy", "true");
    content.innerHTML = '<p class="empty" role="status">Searching posts...</p>';
    try {
      const { posts, pagination: meta } = await api("/posts?q=" + encodeURIComponent(q) + "&page=" + page + "&pageSize=28");
      if (version !== searchVersion || pageVersion !== renderVersion) return;
      if (remember) {
        state.searchHistory = [q, ...state.searchHistory.filter(old => old.toLowerCase() !== q.toLowerCase())].slice(0, 5);
        paintHistory();
      }
      historyPanel.hidden = true;
      state.posts = posts;
      content.setAttribute("aria-busy", "false");
      content.innerHTML = `<div class="${state.user.role === "admin" ? "admin-list" : "cards"} search-results">${posts.map((p) => state.user.role === "admin" ? adminPostRow(p) : card(p)).join("")}</div>${pagination(meta)}${posts.length ? "" : '<p class="empty">No posts found.</p>'}`;
      bindPostActions();
      bindPagination(next => run(value, next));
    } catch (e) {
      if (
        e.handled ||
        version !== searchVersion ||
        pageVersion !== renderVersion
      )
        return;
      content.setAttribute("aria-busy", "false");
      content.innerHTML = `<div class="list-feedback"><p role="alert">${esc(e.message || e)}</p><button type="button" class="pill" data-retry-search>Retry search</button></div>`;
      content.querySelector("[data-retry-search]").onclick = () => run(value, page, remember);
    }
  };
  paintHistory();
  const input = app.querySelector("[name=q]");
  clearSearch.onclick = () => {
    input.value = "";
    input.oninput();
    input.focus();
  };
  input.oninput = () => {
    historyPanel.hidden = Boolean(input.value.trim());
    clearSearch.hidden = !input.value;
    clearTimeout(timer);
    ++searchVersion;
    state.query = input.value.trim();
    state.searchPage = 1;
    state.posts = [];
    if (!input.value.trim()) showSuggestions();
    else {
      content.setAttribute("aria-busy", "true");
      content.innerHTML =
        '<p class="empty" role="status">Searching posts...</p>';
      const value = input.value;
      timer = setTimeout(() => run(value), 220);
    }
  };
  document.querySelector("#search-form").onsubmit = (event) => {
    event.preventDefault();
    clearTimeout(timer);
    return run(input.value, 1, true);
  };
  app.querySelectorAll("[data-category]").forEach(
    (el) =>
      (el.onclick = () => {
        input.value = el.dataset.category;
        run(input.value, 1, true);
      }),
  );
  if (state.query.trim()) run(state.query, state.searchPage);
}
function aboutContent() {
  return `<div class="about-content"><div class="about-intro"><p class="about-eyebrow">Lost &amp; Found System</p><h1>About RETURNO</h1><p>Helping the NVSU community reconnect with lost belongings.</p></div><section class="about-section"><h2>Our purpose</h2><p>RETURNO brings lost and found reports into one place, making it easier to search for an item, share useful details and contact the person who posted it.</p></section><section class="about-section"><h2>How it works</h2><ol class="about-steps"><li><h3>Report an item</h3><p>Create a Lost or Found post with an item name, photo, description, location and date. Add the contact methods you want to share.</p></li><li><h3>Find a match</h3><p>Search or browse posts, then open an item to see its full details and contact information.</p></li><li><h3>Coordinate the return</h3><p>Use the contact information on the post to get in touch. Administrators manage claim and return processing and update report statuses.</p></li></ol></section><div class="about-columns"><section class="about-section"><h2>Students and administrators</h2><p>Students create and view posts. Administrators manage reports and registered accounts, and register additional administrators.</p></section><section class="about-section"><h2>Share thoughtfully</h2><p>Only share contact details you are comfortable displaying on your post. Never include passwords or email verification codes.</p></section></div></div>`;
}
function aboutPage() {
  const fallback = state.user ? (state.user.role === "admin" ? "admin" : "feed") : "role";
  const requestedBack = state.aboutBack || new URLSearchParams(location.search).get("return");
  const back = ["role", "feed", "mine", "search", "admin", "admin-profile"].includes(requestedBack) ? requestedBack : fallback;
  const backControl = `<button type="button" class="profile-back-home about-back" data-go="${esc(back)}" aria-label="Back" title="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h18"/></svg></button>`;
  app.innerHTML = `<section class="screen page about-page">${state.user ? header(false, true, backControl) : `<header class="page-header"><button class="home-logo" data-go="role" aria-label="Home">${logo}</button>${backControl}</header>`}${aboutContent()}</section>`;
  bindNavigation();
}
async function render() {
  const version = ++renderVersion;
  const route = location.hash.slice(1) || "splash";
  if (dialog.open) {
    dialogHistoryEntry = false;
    dialog.close();
  }
  try {
    if (
      ["feed", "mine", "post", "admin", "admin-profile", "search"].includes(
        route,
      ) &&
      !state.user
    ) {
      go("login");
      return;
    }
    if (route === "about") return aboutPage();
    if (route === "splash") {
      app.innerHTML =
        '<section class="screen"><button class="splash" aria-label="Continue"><img src="assets/splash-logo.png" alt="NVSU RETURNO LOST & FOUND SYSTEM"></button></section>';
      const next = () => {
        if (version === renderVersion) go("role", { replace: true });
      };
      app.querySelector("button").onclick = next;
      setTimeout(next, 1800);
      return;
    }
    if (route === "role") {
      app.innerHTML =
        '<section class="screen role-screen"><img class="auth-logo" src="assets/logo.png" alt="RETURNO"><button class="pill role-button student-button" data-role="student">Student</button><button class="pill role-button admin-button" data-role="admin">Admin</button><button type="button" class="about-link" data-go="about">About RETURNO</button></section>';
      bindNavigation();
      app.querySelectorAll("[data-role]").forEach(
        (el) =>
          (el.onclick = () => {
            state.role = el.dataset.role;
            try {
              sessionStorage.setItem("retorno-role", state.role);
            } catch {}
            go("login");
          }),
      );
      return;
    }
    if (route === "forgot-password") {
      if (!['student', 'admin'].includes(state.role)) return go("login");
      return passwordRecoveryScreen();
    }
    if (route === "login" || route === "register")
      return authScreen(route === "register");
    if ((route === "feed" || route === "mine") && state.user.role === "admin")
      return go("admin");
    if (route === "feed" || route === "mine")
      return await feed(route === "mine", version);
    if (route === "post") {
      if (state.user.role === "admin" && !state.edit) return go("admin");
      return editor();
    }
    if (route === "search") return searchPage();
    if (route === "admin-profile") {
      if (state.user.role !== "admin") return go("feed");
      return await adminProfile(version);
    }
    if (route === "admin") {
      if (state.user.role !== "admin") return go("feed");
      return await admin(version);
    }
    go(state.user ? "feed" : "role");
  } catch (e) {
    errorDialog(e);
  }
  window.scrollTo(0, 0);
}
window.addEventListener("popstate", () => {
  if (dialog.open) {
    dialogHistoryEntry = false;
    dialog.close();
    return;
  }
  if (location.hash !== "#post") state.edit = null;
  window.scrollTo(0, 0);
  render();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    app.querySelectorAll("[data-menu]").forEach((el) => (el.hidden = true));
    app
      .querySelectorAll("[data-more]")
      .forEach((el) => el.setAttribute("aria-expanded", "false"));
  }
});
async function start() {
  try {
    state.role =
      sessionStorage.getItem("retorno-role") === "admin" ? "admin" : "student";
  } catch {}
  try {
    const health = await api("/health");
    state.directImageUpload = health.directImageUpload === true;
    if (health.service !== "retorno")
      throw new Error("Open RETURNO using the address printed by npm start.");
    try {
      const { user } = await api("/me");
      state.user = user;
      state.role = user.role;
    } catch (e) {
      if (e.status !== 401) throw e;
    }
    await render();
  } catch (e) {
    app.innerHTML = `<section class="connection-screen"><img src="assets/logo.png" alt="RETURNO"><h1>Unable to connect</h1><p role="alert">${esc(e.message)}</p><button class="pill" id="retry-connection">Retry</button></section>`;
    document.querySelector("#retry-connection").onclick = start;
  }
}
start();
