import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const source = await readFile(
  new URL("../public/app.js", import.meta.url),
  "utf8",
);
function harness({ role = "student", failure = false } = {}) {
  const nodes = new Map();
  const element = (key) => {
    if (!nodes.has(key))
      nodes.set(key, {
        innerHTML: "",
        textContent: "",
        hidden: true,
        disabled: false,
        value: "",
        open: false,
        setAttribute() {},
        querySelector(selector) {
          return selector === "[data-close]"
            ? { onclick: null }
            : element(selector);
        },
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
        querySelectorAll(selector) {
          return selector === "[data-kind]"
            ? kinds
            : selector === "[data-category]"
              ? categories
              : [];
        },
      });
    return nodes.get(key);
  };
  const kinds = ["Lost", "Found"].map((kind) => ({ dataset: { kind } }));
  const categories = [
    "Wallet",
    "Key",
    "Phone",
    "Tumbler",
    "ID",
    "Bracelet",
  ].map((category) => ({ dataset: { category }, onclick: null }));
  const location = { hash: "#post" };
  const entries = ["#post"];
  let historyIndex = 0;
  let renderCount = 0;
  const requests = [];
  const api = async (url, options) => {
    if (url === "/health") return new Promise(() => {}); // Keep startup separate from the interaction under test.
    requests.push({ url, options });
    if (failure) throw (failure instanceof Error ? failure : new Error("Unable to save."));
    if (url.startsWith("/posts?q=")) return { posts: [{ id: "match" }] };
    return { post: { id: "saved" } };
  };
  const ctx = vm.createContext({
    document: {
      querySelector: element,
      querySelectorAll: (selector) =>
        selector === "[data-kind]"
          ? kinds
          : selector === "[data-category]"
            ? categories
            : [],
      addEventListener() {},
    },
    location,
    history: {
      replaceState(_state, _title, hash) {
        entries[historyIndex] = hash;
        location.hash = hash;
      },
      pushState(_state, _title, hash) {
        entries.splice(historyIndex + 1);
        entries.push(hash);
        historyIndex = entries.length - 1;
        location.hash = hash;
      },
      back() {
        if (historyIndex > 0) {
          historyIndex--;
          location.hash = entries[historyIndex];
          return historyIndex;
        }
      },
    },
    window: {
      addEventListener(event, callback) {
        if (event === "popstate") this.popstate = callback;
      },
      scrollTo() {},
    },
    sessionStorage: {
      getItem() {
        return null;
      },
    },
    RetornoAPI: { request: api },
    setTimeout,
    clearTimeout,
    FormData: class {
      constructor() {
        return new Map(
          Object.entries({
            item_name: "Wallet",
            event_at: "2026-10-06T12:30",
            location: "Library",
            description: "Brown wallet",
          }),
        );
      }
    },
  });
  vm.runInContext(source, ctx);
  vm.runInContext(
    `state.user={id:'student',role:'${role}'}; state.role='${role}'; globalThis.__realRender=render; render=()=>{globalThis.__renderCount=(globalThis.__renderCount||0)+1};`,
    ctx,
  );
  return {
    ctx,
    nodes,
    element,
    kinds,
    categories,
    location,
    entries,
    requests,
    get historyIndex() {
      return historyIndex;
    },
  };
}
test("student cards never render post-management controls; admin cards retain them", () => {
  const h = harness();
  const expression =
    "card({id:'post-1',author:'Student',status:'Found',kind:'Found'},true)";
  assert.doesNotMatch(
    vm.runInContext(expression, h.ctx),
    /data-(more|edit|update|delete)/,
  );
  assert.match(vm.runInContext(expression, h.ctx), /data-detail/);
  vm.runInContext("state.user.role='admin'", h.ctx);
  assert.match(vm.runInContext(expression, h.ctx), /data-more/);
  assert.match(vm.runInContext(expression, h.ctx), /data-edit/);
});

for (const role of ["student", "admin"]) {
  test(`${role} logout clears private state and Back cannot restore the portal`, async () => {
    const h = harness({ role });
    assert.match(vm.runInContext("header()", h.ctx), /data-logout>Log out/);
    vm.runInContext("go('search');state.posts=[{id:'private'}];state.query='wallet';state.filter='Lost';state.edit={id:'private'};", h.ctx);
    let removed;
    h.ctx.sessionStorage.removeItem = (key) => { removed = key; };
    const button = { disabled: false };
    h.ctx.logoutButton = button;
    await vm.runInContext("logout(logoutButton)", h.ctx);
    assert.equal(h.requests.at(-1).url, "/logout");
    assert.equal(h.requests.at(-1).options.method, "POST");
    assert.equal(vm.runInContext("state.user", h.ctx), null);
    assert.equal(vm.runInContext("state.posts.length", h.ctx), 0);
    assert.equal(vm.runInContext("state.edit", h.ctx), null);
    assert.equal(vm.runInContext("state.query", h.ctx), "");
    assert.equal(vm.runInContext("state.filter", h.ctx), "All");
    assert.equal(removed, "retorno-role");
    assert.equal(h.location.hash, "#role");
    h.ctx.history.back();
    await vm.runInContext("__realRender()", h.ctx);
    assert.equal(h.location.hash, "#login");
  });
}

test("failed logout keeps the session and enables retry; expired logout clears it", async () => {
  const h = harness({ failure: true });
  h.ctx.logoutButton = { disabled: false };
  await vm.runInContext("logout(logoutButton)", h.ctx);
  assert.equal(h.ctx.logoutButton.disabled, false);
  assert.notEqual(vm.runInContext("state.user", h.ctx), null);
  assert.equal(h.location.hash, "#post");
  assert.equal(h.element("#dialog").open, true);
  const expired = harness({ failure: Object.assign(new Error("Please log in."), { status: 401 }) });
  expired.ctx.logoutButton = { disabled: false };
  await vm.runInContext("logout(logoutButton)", expired.ctx);
  assert.equal(expired.location.hash, "#role");
});
test("successful student post goes straight home and removes editor from history", async () => {
  const h = harness();
  vm.runInContext("state.filter='Lost';editor();", h.ctx);
  assert.match(h.element("#app").innerHTML, /data-go="feed" aria-label="Home"/);
  assert.doesNotMatch(
    h.element("#app").innerHTML,
    /editor-profile|aria-label="Your posts"/,
  );
  h.kinds[1].onclick();
  const button = { disabled: false };
  await h
    .element("#post-form")
    .onsubmit({ preventDefault() {}, currentTarget: {}, submitter: button });
  assert.equal(h.requests[0].options.method, "POST");
  assert.equal(JSON.parse(h.requests[0].options.body).kind, "Found");
  assert.equal(h.location.hash, "#feed");
  assert.equal(h.entries.includes("#post"), false);
  assert.deepEqual(h.entries, ["#feed"]);
  assert.equal(vm.runInContext("state.filter", h.ctx), "All");
});

test("expired posting clears private state and shows login instead of a form error", async () => {
  const h = harness({ failure: Object.assign(new Error("Please log in."), { status: 401 }) });
  vm.runInContext("state.posts=[{id:'private'}];state.query='wallet';editor()", h.ctx);
  h.kinds[0].onclick();
  await h.element("#post-form").onsubmit({ preventDefault() {}, currentTarget: {}, submitter: { disabled: false } });
  assert.equal(h.location.hash, "#login");
  assert.equal(vm.runInContext("state.user", h.ctx), null);
  assert.equal(vm.runInContext("state.posts.length", h.ctx), 0);
  assert.equal(vm.runInContext("state.query", h.ctx), "");
  assert.match(h.element("#auth-error").textContent, /session has expired/);
  assert.equal(h.element("#post-error").textContent, "");
});

test("expired search returns to login without opening an error dialog", async () => {
  const h = harness({ failure: Object.assign(new Error("Please log in."), { status: 401 }) });
  vm.runInContext("searchPage()", h.ctx);
  h.element("[name=q]").value = "wallet";
  h.element("#search-form").onsubmit({ preventDefault() {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(h.location.hash, "#login");
  assert.equal(h.element("#dialog").open, false);
});

test("admin expiry handles every protected operation and preserves the admin login role", async () => {
  for (const [url, method] of [["/admins", "POST"], ["/posts/p", "PUT"], ["/posts/p", "PATCH"], ["/posts/p", "DELETE"], ["/stats", "GET"], ["/users", "GET"]]) {
    const h = harness({ role: "admin", failure: Object.assign(new Error("Please log in."), { status: 401 }) });
    h.ctx.route = url;
    h.ctx.method = method;
    await assert.rejects(vm.runInContext("api(route,{method})", h.ctx), (error) => error.handled === true);
    assert.equal(h.location.hash, "#login");
    assert.equal(vm.runInContext("state.role", h.ctx), "admin");
    assert.equal(vm.runInContext("state.user", h.ctx), null);
  }
});

test("late successful requests cannot restore private state after session expiry", async () => {
  const h = harness();
  let resolveOld;
  h.ctx.RetornoAPI.request = (url) => url === "/posts"
    ? new Promise((resolve) => { resolveOld = resolve; })
    : Promise.reject(Object.assign(new Error("Please log in."), { status: 401 }));
  const old = vm.runInContext("api('/posts')", h.ctx);
  const rejected = assert.rejects(old, (error) => error.handled === true);
  await assert.rejects(vm.runInContext("api('/stats')", h.ctx));
  resolveOld({ posts: [{ id: "private" }] });
  await rejected;
  assert.equal(h.location.hash, "#login");
});

test("wrong login credentials and forbidden operations do not expire the active session", async () => {
  const h = harness({ failure: Object.assign(new Error("Incorrect password."), { status: 401 }) });
  await assert.rejects(vm.runInContext("api('/login')", h.ctx));
  assert.notEqual(vm.runInContext("state.user", h.ctx), null);
  h.ctx.RetornoAPI.request = async () => { throw Object.assign(new Error("Forbidden."), { status: 403 }); };
  await assert.rejects(vm.runInContext("api('/admins')", h.ctx));
  assert.notEqual(vm.runInContext("state.user", h.ctx), null);
});
test("failed submission retains the form and enables correction/retry", async () => {
  const h = harness({ failure: true });
  vm.runInContext("editor()", h.ctx);
  h.kinds[0].onclick();
  const button = { disabled: false };
  await h
    .element("#post-form")
    .onsubmit({ preventDefault() {}, currentTarget: {}, submitter: button });
  assert.equal(h.location.hash, "#post");
  assert.equal(button.disabled, false);
  assert.equal(h.element("#post-error").textContent, "Unable to save.");
});
test("event forms and displays explicitly identify Philippine campus time", () => {
  const h = harness();
  vm.runInContext("editor()", h.ctx);
  assert.match(h.element("#app").innerHTML, /PHT, UTC\+08:00/);
  assert.equal(vm.runInContext("dateText('2026-10-06T12:30')", h.ctx), "2026-10-06 12:30 PHT");
  assert.equal(vm.runInContext("dateText('')", h.ctx), "");
});

test("normal navigation stacks screens and browser Back returns to the prior screen", () => {
  const h = harness();
  vm.runInContext("go('mine');go('search')", h.ctx);
  assert.deepEqual(h.entries, ["#post", "#mine", "#search"]);
  const renderedBeforeBack = vm.runInContext("__renderCount", h.ctx);
  h.ctx.history.back();
  h.ctx.window.popstate();
  assert.equal(h.location.hash, "#mine");
  assert.equal(vm.runInContext("__renderCount", h.ctx), renderedBeforeBack + 1);
});

test("post details open for clicking and keyboard; full long details appear in dialog", () => {
  const h = harness();
  const post = {
    id: "post-1",
    author: "Student",
    status: "Found",
    kind: "Found",
    item_name: "Wallet",
    event_at: "2026-10-06T12:30",
    location: "Library",
    description:
      "A long complete detail that is clipped in the card but readable in full in its detail dialog.",
  };
  const article = {
    dataset: { detail: post.id },
    onclick: null,
    onkeydown: null,
    matches: (selector) => selector === ".card",
  };
  const root = h.element("#app");
  root.querySelectorAll = (selector) =>
    selector === "[data-detail]" ? [article] : [];
  vm.runInContext(
    "state.posts=" + JSON.stringify([post]) + "; bindPostActions()",
    h.ctx,
  );
  const event = { target: { closest: () => null }, preventDefault() {} };
  article.onclick(event);
  assert.equal(h.element("#dialog").open, true);
  assert.match(
    h.element("#dialog").innerHTML,
    /A long complete detail that is clipped in the card but readable in full/,
  );
  h.element("#dialog").close();
  article.onkeydown({ ...event, key: "Enter" });
  assert.equal(h.element("#dialog").open, true);
});
test("all post cards use one fixed grid height and truncate preview rows", async () => {
  const styles = await readFile(
    new URL("../public/styles.css", import.meta.url),
    "utf8",
  );
  assert.match(
    styles,
    /\.cards\s*\{[^}]*grid-auto-rows:\s*clamp\(310px,\s*34vw,\s*340px\)/,
  );
  assert.match(
    styles,
    /\.card-data p\s*\{[^}]*white-space:\s*nowrap[^}]*text-overflow:\s*ellipsis/,
  );
  assert.match(styles, /\.admin-row\s*\{[^}]*height:\s*100px/);
});

test("admin has no public Register link; admin portal offers verified admin creation", () => {
  const h = harness();
  vm.runInContext("state.role='admin';authScreen(false)", h.ctx);
  assert.doesNotMatch(h.element("#app").innerHTML, />Register</);
  vm.runInContext("state.user.role='admin'", h.ctx);
  assert.match(vm.runInContext("header(false,false)", h.ctx), /data-add-admin/);
  vm.runInContext("state.user.role='student'", h.ctx);
  assert.doesNotMatch(
    vm.runInContext("header(false,false)", h.ctx),
    /data-add-admin/,
  );
});
test("search suggestions return when input clears and typing queries all post content", async () => {
  const h = harness();
  vm.runInContext("state.query='';searchPage()", h.ctx);
  assert.match(h.element("#app").innerHTML, /What are you looking for\?/);
  assert.equal(h.categories.length, 6);
  const input = h.element("[name=q]");
  input.value = "Library";
  input.oninput();
  await new Promise((resolve) => setTimeout(resolve, 280));
  assert.ok(h.requests.some((r) => r.url === "/posts?q=Library"));
  input.value = "";
  input.oninput();
  assert.match(
    h.element("#search-content").innerHTML,
    /What are you looking for/,
  );
  assert.equal(vm.runInContext("state.query", h.ctx), "");
  const server = await readFile(
    new URL("../server.js", import.meta.url),
    "utf8",
  );
  for (const field of [
    "p.item_name",
    "p.description",
    "p.location",
    "p.event_at",
    "p.kind",
    "p.status",
    "u.full_name",
  ])
    assert.ok(server.includes("lower(" + field + ")"), field);
});
test("successful student posting replaces the editor entry so Back skips the submitted form", async () => {
  const h = harness();
  vm.runInContext("state.filter='Lost';editor()", h.ctx);
  h.kinds[1].onclick();
  const button = { disabled: false };
  await h
    .element("#post-form")
    .onsubmit({ preventDefault() {}, currentTarget: {}, submitter: button });
  assert.deepEqual(h.entries, ["#feed"]);
});
