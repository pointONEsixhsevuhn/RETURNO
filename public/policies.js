"use strict";
// Keep the return destination local and limited to known application routes.
(() => {
  const routes = new Set(["role", "login", "feed", "mine", "search", "admin", "admin-profile", "about"]);
  const params = new URLSearchParams(location.search);
  const policyPage = Boolean(document.querySelector(".policy-card")) || Boolean(document.querySelector(".policy-page"));
  const aboutPage = Boolean(document.querySelector(".about-page"));
  const returnRoute = routes.has(params.get("return")) ? params.get("return") : "role";
  const role = params.get("role") === "admin" ? "admin" : "student";
  const back = document.querySelector("[data-policy-back]");
  const aboutReturns = new Set(["role", "login", "feed", "mine", "search", "admin", "admin-profile"]);
  const aboutReturn = aboutReturns.has(params.get("aboutReturn")) ? params.get("aboutReturn") : role === "admin" ? "admin" : "feed";
  if (back) back.href = policyPage
    ? returnRoute === "about"
      ? `/?return=${encodeURIComponent(aboutReturn)}#about`
      : "/#" + returnRoute
    : "/#role";
  back?.addEventListener("click", event => {
    event.preventDefault();
    try { sessionStorage.setItem("retorno-role", role); } catch {}
    location.assign(back.getAttribute("href"));
  });
  document.addEventListener("click", event => {
    const link = event.target.closest("[data-policy-link], [data-about-link], .policy-agreement a");
    if (!link) return;
    let destination = returnRoute;
    let selectedRole = role;
    if (!policyPage) {
      const route = location.hash.slice(1);
      destination = routes.has(route) ? route : ["register", "forgot-password", "reset-password"].includes(route) ? "login" : "role";
      try { selectedRole = sessionStorage.getItem("retorno-role") === "admin" ? "admin" : "student"; } catch {}
    }
    const name = document.querySelector(".welcome")?.textContent.replace(/^Welcome,\s*|!$/g, "").trim();
    const url = link.matches("[data-policy-back]")
      ? new URL(link.getAttribute("href"), location.href)
      : new URL(link.getAttribute("href"), location.href);
    url.searchParams.set("return", destination);
    if (destination === "about") url.searchParams.set("aboutReturn", aboutReturn);
    url.searchParams.set("role", selectedRole);
    if (name) url.searchParams.set("name", name);
    link.href = url.pathname + url.search + url.hash;
    if (link.matches("[data-about-link], .policy-agreement a, [data-policy-back]")) {
      event.preventDefault();
      location.assign(link.href);
    }
  });
})();
