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
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
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
    URLSearchParams,
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
test("posting hides timezone text while preserving campus time formatting", () => {
  const h = harness();
  vm.runInContext("editor()", h.ctx);
  assert.doesNotMatch(h.element("#app").innerHTML, /PHT|UTC/);
  h.kinds[0].onclick();
  assert.equal(h.element("#event-time-label").textContent, "Date time lost:");
  h.kinds[1].onclick();
  assert.equal(h.element("#event-time-label").textContent, "Date time found:");
  assert.equal(vm.runInContext("dateText('2026-10-06T12:30')", h.ctx), "2026-10-06 12:30 PHT");
  assert.equal(vm.runInContext("dateText('')", h.ctx), "");
});

test("feed shows loading, then empty results and an own-post creation action", async () => {
  const h = harness();
  let finish;
  h.ctx.RetornoAPI.request = () => new Promise((resolve) => { finish = resolve; });
  const pending = vm.runInContext("feed(false,renderVersion)", h.ctx);
  assert.match(h.element("#app").innerHTML, /Loading posts/);
  assert.match(h.element("#app").innerHTML, /aria-busy="true"/);
  finish({ posts: [] });
  await pending;
  assert.match(h.element("#app").innerHTML, /No posts match this filter/);
  h.ctx.RetornoAPI.request = async () => ({ posts: [] });
  await vm.runInContext("feed(true,renderVersion)", h.ctx);
  assert.match(h.element("#app").innerHTML, /not posted any items yet/);
  assert.match(h.element("#app").innerHTML, /aria-label="Add post"/);
});

test("feed failure offers a manual retry with the original filter", async () => {
  const h = harness({ failure: true });
  vm.runInContext("state.filter='Lost'", h.ctx);
  await vm.runInContext("feed(false,renderVersion)", h.ctx);
  assert.match(h.element("#app").innerHTML, /role="alert"/);
  assert.equal(h.requests.length, 1);
  h.ctx.RetornoAPI.request = async (url) => {
    assert.equal(url, "/posts?kind=Lost");
    return { posts: [{ id: "recovered", kind: "Lost", status: "Lost" }] };
  };
  await h.element("[data-retry-list]").onclick();
  assert.match(h.element("#app").innerHTML, /recovered/);
  assert.doesNotMatch(h.element("#app").innerHTML, /data-retry-list/);
});

test("admin loading and retry preserve status and render an empty report list", async () => {
  const h = harness({ role: "admin", failure: true });
  const pending = vm.runInContext("admin(renderVersion,'Returned')", h.ctx);
  assert.match(h.element("#app").innerHTML, /Loading dashboard/);
  await pending;
  assert.match(h.element("#app").innerHTML, /data-retry-list/);
  h.ctx.RetornoAPI.request = async (url) => {
    if (url.startsWith("/posts")) {
      assert.equal(url, "/posts?status=Returned");
      return { posts: [] };
    }
    return url === "/stats" ? { stats: { Lost: 0, Found: 0, Claimed: 0, Returned: 0 } } : { users: [] };
  };
  await h.element("[data-retry-list]").onclick();
  assert.match(h.element(".admin-list").innerHTML, /No returned posts/);
  assert.doesNotMatch(h.element("#app").innerHTML, /Registered users/);
  assert.doesNotMatch(h.element("#app").innerHTML, /class="stats"/);
  assert.match(h.element("#app").innerHTML, /filter-count/);
});

test("search shows loading, retry and empty results without changing the query", async () => {
  const h = harness();
  let fail;
  h.ctx.RetornoAPI.request = () => new Promise((_resolve, reject) => { fail = reject; });
  vm.runInContext("searchPage()", h.ctx);
  h.element("[name=q]").value = "wallet";
  const pending = h.element("#search-form").onsubmit({ preventDefault() {} });
  assert.match(h.element("#search-content").innerHTML, /Searching posts/);
  assert.equal(h.element("#search-content").attributes["aria-busy"], "true");
  fail(new Error("Disconnected"));
  await pending;
  assert.match(h.element("#search-content").innerHTML, /Disconnected/);
  assert.equal(h.element("#search-content").attributes["aria-busy"], "false");
  h.ctx.RetornoAPI.request = async (url) => {
    assert.equal(url, "/posts?q=wallet");
    return { posts: [] };
  };
  await h.element("[data-retry-search]").onclick();
  assert.match(h.element("#search-content").innerHTML, /No posts found/);
  assert.equal(h.element("[name=q]").value, "wallet");
  h.element("[name=q]").value = "";
  h.element("[name=q]").oninput();
  assert.match(h.element("#search-content").innerHTML, /What are you looking for/);
});

test("late list failures cannot replace a newly navigated screen", async () => {
  const h = harness();
  let fail;
  h.ctx.RetornoAPI.request = () => new Promise((_resolve, reject) => { fail = reject; });
  const pending = vm.runInContext("feed(false,renderVersion)", h.ctx);
  vm.runInContext("++renderVersion;app.innerHTML='New screen'", h.ctx);
  fail(new Error("Old failure"));
  await pending;
  assert.equal(h.element("#app").innerHTML, "New screen");
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
test("typing immediately invalidates an older search before the debounce runs", async () => {
  const h = harness();
  let queued;
  h.ctx.setTimeout = (callback) => { queued = callback; return 1; };
  h.ctx.clearTimeout = () => {};
  let finish;
  h.ctx.RetornoAPI.request = () => new Promise((resolve) => { finish = resolve; });
  vm.runInContext("searchPage()", h.ctx);
  const input = h.element("[name=q]");
  input.value = "wallet";
  const old = h.element("#search-form").onsubmit({ preventDefault() {} });
  input.value = "phone";
  input.oninput();
  finish({ posts: [{ id: "old-wallet" }] });
  await old;
  assert.doesNotMatch(h.element("#search-content").innerHTML, /old-wallet/);
  assert.equal(vm.runInContext("state.query", h.ctx), "phone");
  h.ctx.RetornoAPI.request = async (url) => {
    assert.equal(url, "/posts?q=phone");
    return { posts: [{ id: "new-phone" }] };
  };
  await queued();
  assert.match(h.element("#search-content").innerHTML, /new-phone/);
});

test("pending search debounce does not request or change state after navigation", async () => {
  const h = harness();
  let queued;
  h.ctx.setTimeout = (callback) => { queued = callback; return 1; };
  h.ctx.clearTimeout = () => {};
  vm.runInContext("searchPage()", h.ctx);
  h.element("[name=q]").value = "wallet";
  h.element("[name=q]").oninput();
  vm.runInContext("++renderVersion;state.query='new page';app.innerHTML='New page'", h.ctx);
  await queued();
  assert.equal(h.requests.length, 0);
  assert.equal(vm.runInContext("state.query", h.ctx), "new page");
  assert.equal(h.element("#app").innerHTML, "New page");
});

test("category search cancels a previously queued typed query", async () => {
  const h = harness();
  const timers = new Map();
  h.ctx.setTimeout = (callback) => { timers.set(1, callback); return 1; };
  h.ctx.clearTimeout = (id) => timers.delete(id);
  vm.runInContext("searchPage()", h.ctx);
  h.element("[name=q]").value = "wallet";
  h.element("[name=q]").oninput();
  h.categories[2].onclick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(timers.size, 0);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, "/posts?q=Phone");
});

function imageReaders(h) {
  const readers = [];
  h.ctx.FileReader = class {
    constructor() { readers.push(this); }
    readAsDataURL() {}
  };
  vm.runInContext("editor()", h.ctx);
  h.kinds[0].onclick();
  return readers;
}
const imageEvent = (type = "image/png") => ({ target: { files: [{ type, size: 100 }], value: "file" } });

test("older image completion cannot overwrite the latest selection or unblock submission", async () => {
  const h = harness();
  const readers = imageReaders(h);
  const change = h.element("#image-input").onchange;
  const old = change(imageEvent());
  const latest = change(imageEvent());
  readers[0].result = "old-image";
  readers[0].onload();
  await old;
  assert.doesNotMatch(h.element("#upload-preview").innerHTML, /old-image/);
  const submit = () => h.element("#post-form").onsubmit({ preventDefault() {}, currentTarget: {}, submitter: { disabled: false } });
  await submit();
  assert.equal(h.requests.length, 0);
  assert.match(h.element("#post-error").textContent, /wait for the image/);
  readers[1].result = "new-image";
  readers[1].onload();
  await latest;
  await submit();
  assert.equal(JSON.parse(h.requests[0].options.body).image, "new-image");
});

test("an outdated image failure cannot erase a successful newer preview", async () => {
  const h = harness();
  const readers = imageReaders(h);
  const change = h.element("#image-input").onchange;
  const old = change(imageEvent());
  const latest = change(imageEvent());
  readers[1].result = "new-image";
  readers[1].onload();
  await latest;
  readers[0].onerror();
  await old;
  assert.match(h.element("#upload-preview").innerHTML, /new-image/);
  assert.equal(h.element("#post-error").textContent, "");
});

test("image reads finishing after navigation leave the next editor unchanged", async () => {
  const h = harness();
  const readers = imageReaders(h);
  const pending = h.element("#image-input").onchange(imageEvent());
  vm.runInContext("++renderVersion;editor()", h.ctx);
  h.element("#upload-preview").innerHTML = "New editor preview";
  readers[0].result = "old-image";
  readers[0].onload();
  await pending;
  assert.equal(h.element("#upload-preview").innerHTML, "New editor preview");
});

test("invalid image selection invalidates an older pending read", async () => {
  const h = harness();
  const readers = imageReaders(h);
  const change = h.element("#image-input").onchange;
  const pending = change(imageEvent());
  await change(imageEvent("image/svg+xml"));
  readers[0].result = "old-image";
  readers[0].onload();
  await pending;
  assert.doesNotMatch(h.element("#upload-preview").innerHTML, /old-image/);
  assert.match(h.element("#post-error").textContent, /PNG, JPEG, or WebP/);
});

test("a post saved after navigation cannot redirect away from the new screen", async () => {
  const h = harness();
  vm.runInContext("editor()", h.ctx);
  h.kinds[0].onclick();
  let finish;
  h.ctx.RetornoAPI.request = () => new Promise((resolve) => { finish = resolve; });
  const pending = h.element("#post-form").onsubmit({ preventDefault() {}, currentTarget: {}, submitter: { disabled: false } });
  vm.runInContext("++renderVersion;location.hash='#search';state.query='phone';app.innerHTML='Search screen'", h.ctx);
  finish({ post: { id: "saved" } });
  await pending;
  assert.equal(h.location.hash, "#search");
  assert.equal(vm.runInContext("state.query", h.ctx), "phone");
  assert.equal(h.element("#app").innerHTML, "Search screen");
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

test("image picker accepts 10 MB and rejects larger files before reading", async () => {
  const h=harness(); const readers=imageReaders(h);
  const accepted=imageEvent(); accepted.target.files[0].size=10*1024*1024;
  const reading=h.element("#image-input").onchange(accepted);
  assert.equal(readers.length,1); readers[0].result="boundary-image"; readers[0].onload(); await reading;
  const rejected=imageEvent(); rejected.target.files[0].size=10*1024*1024+1;
  await h.element("#image-input").onchange(rejected);
  assert.equal(readers.length,1); assert.match(h.element("#post-error").textContent,/10 MB/);
});
