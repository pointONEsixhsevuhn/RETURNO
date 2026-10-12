"use strict";
// Keep the return destination local and limited to known application routes.
(() => {
  const routes = new Set(["role", "login", "feed", "mine", "search", "admin", "admin-profile", "about"]);
  const params = new URLSearchParams(location.search);
  const policyPage = Boolean(document.querySelector(".policy-page"));
  const returnRoute = routes.has(params.get("return")) ? params.get("return") : "role";
  const role = params.get("role") === "admin" ? "admin" : "student";
  const back = document.querySelector("[data-policy-back]");
  if (back) {
    back.href = "/#" + returnRoute;
    back.addEventListener("click", () => {
      try { sessionStorage.setItem("retorno-role", role); } catch {}
    });
  }
  document.addEventListener("click", event => {
    const link = event.target.closest("[data-policy-link]");
    if (!link) return;
    let destination = returnRoute;
    let selectedRole = role;
    if (!policyPage) {
      const route = location.hash.slice(1);
      destination = routes.has(route) ? route : ["register", "forgot-password", "reset-password"].includes(route) ? "login" : "role";
      try { selectedRole = sessionStorage.getItem("retorno-role") === "admin" ? "admin" : "student"; } catch {}
    }
    const url = new URL(link.getAttribute("href"), location.href);
    url.searchParams.set("return", destination);
    url.searchParams.set("role", selectedRole);
    link.href = url.pathname + url.search;
  });
})();
