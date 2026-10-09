"use strict";
const app = document.querySelector("#app");
const dialog = document.querySelector("#dialog");
const state = {
  user: null,
  role: "student",
  filter: "All",
  query: "",
  posts: [],
  edit: null,
  back: "mine",
};
let renderVersion = 0;
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
  ++sessionVersion;
  state.user = null;
  state.filter = "All";
  state.query = "";
  state.posts = [];
  state.edit = null;
  state.back = "mine";
}
function go(route, { replace = false } = {}) {
  const target = "#" + route;
  if (location.hash === target) {
    render();
    return;
  }
  if (replace) history.replaceState(null, "", target);
  else history.pushState(null, "", target);
  if (route !== "post") state.edit = null;
  window.scrollTo(0, 0);
  render();
}
function errorAt(target, error) {
  if (error.handled) return;
  target.textContent = error.message || error;
}
function header(search = true, welcome = true) {
  return `<header class="page-header"><button class="home-logo" data-go="${state.user.role === "admin" ? "admin" : "feed"}" aria-label="Home">${logo}</button><div class="brand-line"></div>${welcome ? `<h1 class="welcome">WELCOME, ${state.user.role.toUpperCase()}!</h1>` : ""}<div class="header-actions"><button type="button" class="pill logout-button" data-logout>Log out</button>${state.user.role === "admin" ? '<button class="pill admin-create" data-add-admin>Register admin</button>' : ""}<div class="header-icons">${search ? `<button class="icon" data-go="search" aria-label="Search">${searchIcon}</button>` : ""}<button class="icon" data-go="${state.user.role === "admin" ? "admin-profile" : "mine"}" aria-label="${state.user.role === "admin" ? "Admin profile" : "Your posts"}">${profileIcon}</button></div></div></header>`;
}
function bindNavigation() {
  app
    .querySelectorAll("[data-go]")
    .forEach((el) => (el.onclick = () => go(el.dataset.go)));
  app
    .querySelectorAll("[data-logout]")
    .forEach((button) => (button.onclick = () => logout(button)));
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
  app.innerHTML = `<section class="screen ${register ? "registration" : "login"}"><img class="auth-logo" src="assets/logo.png" alt="RETURNO">${switcher}<form id="auth-form" ${state.role === "student" ? `role="tabpanel" aria-labelledby="${register ? "register-tab" : "login-tab"}"` : ""}>${register ? authField("email", "Enter gmail", "email", "field-0", "email") + authField("fullName", "Full name", "text", "field-1", "name") + authField("password", "Set password", "password", "field-2", "new-password", true) + authField("confirmPassword", "Confirm password", "password", "field-3", "new-password", true) + '<button class="pill login-button" type="submit">Register</button>' : authField("email", "Email", "email", "email-field", "email") + authField("password", "Password", "password", "password-field", "current-password", true) + '<button class="pill login-button" type="submit">Log In</button>' + (state.role === "student" ? '<button class="forgot-password-link" type="button" data-go="forgot-password">Forgot password?</button>' : "")}<p class="error auth-error" id="auth-error" role="alert"></p></form>${register ? "" : '<footer class="legal">Privacy Act<br>Terms &amp; Conditions</footer>'}</section>`;
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
  app.innerHTML = `<main class="auth-page">${logo}<h1>Confirm your email</h1><p>We sent a six-digit code to ${esc(email)}. Check your inbox and spam folder. It expires in 10 minutes.</p><form id="verification-form"><label for="verification-code">Verification code</label><input class="pill" id="verification-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required><p id="verification-error" role="alert"></p><button class="pill" type="submit">Confirm email</button></form><button class="pill" id="verification-back">Register again / request a new code</button></main>`;
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
  app.innerHTML = `<main class="auth-page ${resetting ? "password-reset" : "password-recovery"}">${logo}${resetting ? '<h1>Reset password</h1><p>If this email belongs to a student account, a reset code will be sent. Check your inbox and spam folder. It expires in 10 minutes. Wait one minute before requesting another code. If no email arrives, contact the administrator.</p>' : ""}<form id="recovery-form">${resetting ? '<label for="reset-code">Reset code</label><input class="pill" id="reset-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>' + authField("password", "New password", "password", "", "new-password") + authField("confirmPassword", "Confirm new password", "password", "", "new-password") : authField("email", "Enter your registered email", "email", "", "email")}<p class="error" id="recovery-error" role="alert"></p><button type="submit" class="${resetting ? "pill" : "send-reset-code"}">${resetting ? "Change password" : "Send reset code"}</button></form>${resetting ? '<button type="button" class="pill" id="resend-reset">Request another code</button>' : ""}</main>`;
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
      state.role = "student";
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
function fields(post, own = false) {
  return `<div class="card-data"><p>Item name: ${esc(post.item_name)}</p><p>${own ? `Date &amp; ${post.kind === "Found" ? "Time found" : "time lost"}` : "Date &amp; time" + (post.kind === "Lost" ? " lost" : "")}: ${esc(dateText(post.event_at))}</p><p>Location/Address: ${esc(post.location)}</p><p>Description: ${esc(post.description)}</p></div>`;
}
function menu(post) {
  if (state.user?.role !== "admin") return "";
  return `<div class="menu" data-menu="${post.id}" hidden><button data-edit="${post.id}">Edit</button><button data-update="${post.id}">Update</button><button data-delete="${post.id}">Delete</button></div>`;
}
function card(post, own = false) {
  const manage = own && state.user?.role === "admin";
  return `<article class="card" data-detail="${esc(post.id)}" role="${manage ? "group" : "button"}" tabindex="0" aria-label="View details for ${esc(post.item_name)}"><div class="card-head">${manage ? `<button class="more" data-more="${post.id}" aria-label="Post options" aria-expanded="false">•••</button>` : `<div class="author">Posted by:<strong>${esc(post.author)}</strong></div>`}<span class="status">${post.status}</span></div>${itemImage(post)}${fields(post, own)}${manage ? menu(post) : ""}</article>`;
}
function filters() {
  return `<nav class="filters" aria-label="Post type">${["All", "Lost", "Found"].map((x) => `<button data-filter="${x}" class="${state.filter === x ? "active" : ""}">${x.toUpperCase()}</button>`).join("")}</nav>`;
}
function openDialog(label) {
  dialog.setAttribute("aria-label", label);
  if (!dialog.open) dialog.showModal();
}
function errorDialog(error) {
  if (error.handled) return;
  dialog.innerHTML = `<p>${esc(error.message || error)}</p><div class="dialog-actions"><button data-close>Close</button></div>`;
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  openDialog("Error");
}
function showDetails(id) {
  const post = state.posts.find((p) => p.id === id);
  if (!post) return;
  dialog.innerHTML = `<h2>${esc(post.item_name || "Item name")}</h2>${post.image ? `<img class="detail-image" src="${esc(post.image)}" alt="${esc(post.item_name)}">` : ""}<div class="detail-data"><p>Posted by: <strong>${esc(post.author)}</strong></p><p>Status: ${esc(post.status)}</p><p>Date &amp; time found/lost: ${esc(dateText(post.event_at))}</p><p>Location/Address: ${esc(post.location)}</p><p>Description: ${esc(post.description)}</p></div><div class="dialog-actions"><button data-close>Close</button></div>`;
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  openDialog(post.item_name || "Item details");
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
  if (state.user?.role !== "admin") return;
  app
    .querySelectorAll("[data-add-admin]")
    .forEach((button) => (button.onclick = () => showAdminRegistration()));
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
        go("post");
      }),
  );
  app.querySelectorAll("[data-update]").forEach(
    (button) =>
      (button.onclick = () => {
        const post = state.posts.find((p) => p.id === button.dataset.update);
        dialog.innerHTML = `<form id="update-form"><h2>Update</h2><label for="update-status">Status:</label><select id="update-status" name="status">${["Lost", "Found", "Claimed", "Returned"].map((s) => `<option ${s === post.status ? "selected" : ""}>${s}</option>`).join("")}</select><p class="error" role="alert"></p><div class="dialog-actions"><button type="button" data-close>Cancel</button><button>Update</button></div></form>`;
        dialog.querySelector("[data-close]").onclick = () => dialog.close();
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
            dialog.close();
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
        dialog.querySelector("[data-close]").onclick = () => dialog.close();
        dialog.querySelector("[data-confirm]").onclick = async (event) => {
          event.currentTarget.disabled = true;
          try {
            await api("/posts/" + id, { method: "DELETE" });
            dialog.close();
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
async function feed(own, version) {
  const params = new URLSearchParams();
  if (own) params.set("mine", "1");
  else if (state.filter !== "All") params.set("kind", state.filter);
  listLoading(own ? "Loading your posts..." : "Loading posts...");
  let posts;
  try {
    ({ posts } = await api("/posts?" + params));
  } catch (error) {
    listFailure(error, version, () => feed(own, ++renderVersion));
    return;
  }
  if (version !== renderVersion) return;
  state.posts = posts;
  app.innerHTML = `<section class="screen page ${own ? "own" : ""}">${header(!own)}${own ? '<h2 class="own-title">Your post</h2>' : filters()}<div class="cards">${posts.map((p) => card(p, own)).join("")}${own ? '<button class="card add-card" id="add-post" aria-label="Add post">+</button>' : ""}</div>${!posts.length ? `<p class="empty" role="status">${own ? "You have not posted any items yet. Use Add post to report an item." : "No posts match this filter."}</p>` : ""}</section>`;
  bindNavigation();
  bindPostActions();
  if (own)
    document.querySelector("#add-post").onclick = () => {
      state.edit = null;
      state.back = "mine";
      go("post");
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
    reading = false;
  app.innerHTML = `<section class="screen editor"><form class="editor-panel" id="post-form"><div class="editor-head"><button type="button" class="editor-logo" data-go="${state.user.role === "admin" ? state.back : "feed"}" aria-label="${state.user.role === "admin" ? "Back" : "Home"}">${logo}</button><div class="editor-actions"><button type="button" class="pill cancel-post-button" data-cancel-post>Cancel</button><button class="pill post-button" type="submit">${post ? "Update" : "Post"}</button></div></div><label class="upload-area" id="upload-area"><span id="upload-preview">${image ? `<img src="${esc(image)}" alt="Selected item">` : "Upload your image here"}</span><input type="file" id="image-input" accept="image/png,image/jpeg,image/webp" aria-label="Upload your image here"></label><div class="post-fields"><div class="post-field status-field"><span>Status:</span><button id="status-trigger" class="pill status-trigger" type="button" aria-expanded="false" aria-controls="status-options"><span id="chosen-kind">${kind}</span><span class="triangle"></span></button><div class="status-options" id="status-options" hidden><button type="button" data-kind="Lost">Lost</button><button type="button" data-kind="Found">Found</button></div></div><label class="post-field"><span>Item name:</span><input name="item_name" required maxlength="200" value="${esc(post?.item_name)}"></label><label class="post-field"><span>Date &amp; time found/lost (PHT, UTC+08:00):</span><input name="event_at" type="datetime-local" required value="${esc(post?.event_at)}"></label><label class="post-field"><span>Location/Address :</span><input name="location" required maxlength="500" value="${esc(post?.location)}"></label><label class="post-field"><span>Description:</span><textarea name="description" required maxlength="3000">${esc(post?.description)}</textarea></label></div><p id="post-error" class="error" role="alert"></p></form></section>`;
  bindNavigation();
  document.querySelector("[data-cancel-post]").onclick = () => {
    state.edit = null;
    go(state.user.role === "admin" ? state.back : "feed", { replace: true });
  };
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
        options.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }),
  );
  document.querySelector("#image-input").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const version = ++imageVersion;
    reading = false;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      event.target.value = "";
      return errorAt(
        output,
        "Use a PNG, JPEG, or WebP image smaller than 2 MB.",
      );
    }
    reading = true;
    output.textContent = "";
    try {
      const selectedImage = await new Promise((resolve, reject) => {
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
    output.textContent = "";
    if (!kind) return errorAt(output, "Select Lost or Found.");
    if (reading) return errorAt(output, "Please wait for the image.");
    const data = {
      ...Object.fromEntries(new FormData(event.currentTarget)),
      kind,
      image,
    };
    if (post)
      data.status = ["Lost", "Found"].includes(post.status)
        ? kind
        : post.status;
    const button = event.submitter;
    button.disabled = true;
    try {
      await api("/posts" + (post ? "/" + post.id : ""), {
        method: post ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      if (pageVersion !== renderVersion) return;
      state.edit = null;
      state.filter = "All";
      state.query = "";
      go(state.user.role === "admin" ? state.back : "feed", { replace: true });
    } catch (e) {
      if (pageVersion !== renderVersion) return;
      errorAt(output, e);
      button.disabled = false;
    }
  };
}
function showAdminRegistration() {
  dialog.innerHTML = `<form id="admin-register-form"><h2>Register another admin</h2><label>Email<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>Full name<input name="fullName" required maxlength="100" autocomplete="name"></label><label>Password<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><label>Confirm password<input name="confirmPassword" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><p class="error" role="alert"></p><div class="dialog-actions"><button type="button" data-close>Cancel</button><button type="submit">Register admin</button></div></form>`;
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
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
      dialog.close();
    } catch (error) {
      errorAt(output, error);
      submit.disabled = false;
    }
  };
  openDialog("Register another admin");
}
async function admin(version, status = "") {
  listLoading("Loading dashboard...");
  let result, totals;
  try {
    [result, totals] = await Promise.all([
      api("/posts" + (status ? "?status=" + status : "")),
      api("/stats"),
    ]);
  } catch (error) {
    listFailure(error, version, () => admin(++renderVersion, status));
    return;
  }
  if (version !== renderVersion) return;
  state.posts = result.posts;
  app.innerHTML = `<section class="screen page admin">${header()}<div class="stats">${["Lost", "Returned", "Found", "Claimed"].map((status) => `<button class="stat" data-stat="${status}">${status.toUpperCase()}<span>${totals.stats[status]}</span></button>`).join("")}</div><div class="filters"><button class="active" id="all-posts">${status ? status.toUpperCase() : "ALL"}</button></div><div class="admin-list">${result.posts.map((p) => `<article class="admin-row">${itemImage(p, "row-image")}<button class="row-info" data-detail="${p.id}">Posted by:<strong>${esc(p.author)}</strong><small>Click to view more details</small></button><button class="more" data-more="${p.id}" aria-label="Post options" aria-expanded="false">⋮</button>${menu(p)}</article>`).join("")}</div></section>`;
  bindNavigation();
  bindPostActions();
  if (!result.posts.length)
    app.querySelector(".admin-list").innerHTML =
      `<p class="empty" role="status">${status ? `No ${esc(status.toLowerCase())} posts.` : "No reports have been posted yet."}</p>`;
  app
    .querySelectorAll("[data-stat]")
    .forEach(
      (el) =>
        (el.onclick = () =>
          admin(++renderVersion, el.dataset.stat).catch(errorDialog)),
    );
  document.querySelector("#all-posts").onclick = () => render();
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
    const users = result.users.filter((user) => user.role === role);
    return `<section class="registered-users" aria-label="${title}"><div class="registered-users-head"><h3>${title}</h3><span>${users.length}</span></div><div class="registered-user-list">${users.map((user) => `<article class="registered-user"><strong>${esc(user.full_name)}</strong><span class="registered-user-email">${esc(user.email)}</span><div class="registered-user-actions"><span class="registered-user-role">${role === "admin" ? "Admin" : "Student"}</span>${user.id !== state.user.id ? `<button type="button" class="pill delete-account" data-delete-account="${esc(user.id)}" aria-label="Delete account for ${esc(user.email)}">Delete account</button>` : ""}</div></article>`).join("") || '<p class="empty">No registered users yet.</p>'}</div></section>`;
  };
  app.innerHTML = `<section class="screen page admin-profile">${header()}<h2>Admin profile</h2><p>${esc(state.user.fullName)} · ${esc(state.user.email)}</p><h2>Registered users</h2><div class="user-groups">${group("admin", "Admin users")}${group("student", "Student users")}</div></section>`;
  bindNavigation();
  bindPostActions();
  app.querySelectorAll("[data-delete-account]").forEach(button => {
    button.onclick = () => {
      const target = result.users.find(user => user.id === button.dataset.deleteAccount);
      dialog.innerHTML = `<h2>Delete account?</h2><p>Delete ${esc(target.full_name)} (${esc(target.email)})? All their reports will be permanently deleted, and they will be signed out everywhere.</p><form id="delete-account-form"><label for="delete-account-email">Type the account email to confirm</label><input id="delete-account-email" type="email" maxlength="254" required autocomplete="off" class="pill"><p class="error" role="alert"></p><div class="dialog-actions"><button type="button" data-close>Cancel</button><button type="submit">Delete account</button></div></form>`;
      dialog.querySelector("[data-close]").onclick = () => dialog.close();
      dialog.querySelector("#delete-account-form").onsubmit = async event => {
        event.preventDefault();
        const submit = event.currentTarget.querySelector("[type=submit]");
        const output = dialog.querySelector(".error");
        submit.disabled = true;
        output.textContent = "";
        try {
          await api("/users/" + target.id, { method: "DELETE", body: JSON.stringify({ confirmEmail: dialog.querySelector("#delete-account-email").value }) });
          if (version !== renderVersion) return;
          dialog.close();
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
  app.innerHTML = `<section class="screen page search-page">${header(false, false)}<form id="search-form" class="search-box pill"><button class="icon" aria-label="Search">${searchIcon}</button><input name="q" type="search" maxlength="200" placeholder="Search item name, description, or location" aria-label="Search posts" value="${esc(state.query)}"></form><div id="search-content">${suggestions()}</div></section>`;
  bindNavigation();
  let searchVersion = 0,
    timer;
  const content = document.querySelector("#search-content");
  const showSuggestions = () => {
    clearTimeout(timer);
    ++searchVersion;
    state.query = "";
    state.posts = [];
    content.setAttribute("aria-busy", "false");
    content.innerHTML = suggestions();
    app
      .querySelectorAll("[data-category]")
      .forEach((el) => (el.onclick = () => run(el.dataset.category)));
  };
  const run = async (value) => {
    if (pageVersion !== renderVersion) return;
    clearTimeout(timer);
    const q = value.trim();
    state.query = q;
    if (!q) {
      showSuggestions();
      return;
    }
    const version = ++searchVersion;
    app.querySelector("[name=q]").value = value;
    state.posts = [];
    content.setAttribute("aria-busy", "true");
    content.innerHTML = '<p class="empty" role="status">Searching posts...</p>';
    try {
      const { posts } = await api("/posts?q=" + encodeURIComponent(q));
      if (version !== searchVersion || pageVersion !== renderVersion) return;
      state.posts = posts;
      content.setAttribute("aria-busy", "false");
      content.innerHTML = `<div class="cards search-results">${posts.map((p) => card(p)).join("")}</div>${posts.length ? "" : '<p class="empty">No posts found.</p>'}`;
      bindPostActions();
    } catch (e) {
      if (
        e.handled ||
        version !== searchVersion ||
        pageVersion !== renderVersion
      )
        return;
      content.setAttribute("aria-busy", "false");
      content.innerHTML = `<div class="list-feedback"><p role="alert">${esc(e.message || e)}</p><button type="button" class="pill" data-retry-search>Retry search</button></div>`;
      content.querySelector("[data-retry-search]").onclick = () => run(value);
    }
  };
  const input = app.querySelector("[name=q]");
  input.oninput = () => {
    clearTimeout(timer);
    ++searchVersion;
    state.query = input.value.trim();
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
    return run(input.value);
  };
  app.querySelectorAll("[data-category]").forEach(
    (el) =>
      (el.onclick = () => {
        input.value = el.dataset.category;
        run(input.value);
      }),
  );
}
async function render() {
  const version = ++renderVersion;
  const route = location.hash.slice(1) || "splash";
  if (dialog.open) dialog.close();
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
        '<section class="screen role-screen"><img class="auth-logo" src="assets/logo.png" alt="RETURNO"><button class="pill role-button student-button" data-role="student">Student</button><button class="pill role-button admin-button" data-role="admin">Admin</button></section>';
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
      if (state.role !== "student") return go("login");
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
    app.innerHTML = `<section class="connection-screen"><img src="assets/logo.png" alt="RETURNO"><h1>Unable to connect</h1><p role="alert">${esc(e.message)}</p><button class="pill" id="retry-connection">Retry</button><p><a href="http://localhost:3000/">Open local system</a></p></section>`;
    document.querySelector("#retry-connection").onclick = start;
  }
}
start();
