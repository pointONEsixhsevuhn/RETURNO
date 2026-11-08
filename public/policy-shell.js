"use strict";
(() => {
  const routes = new Set(["role", "login", "feed", "mine", "search", "admin", "admin-profile", "about"]);
  const aboutReturns = new Set(["role", "login", "feed", "mine", "search", "admin", "admin-profile"]);
  const params = new URLSearchParams(location.search);
  const fallback = params.get("role") === "admin" ? "admin" : "feed";
  const returnRoute = routes.has(params.get("return")) ? params.get("return") : fallback;
  const aboutReturn = aboutReturns.has(params.get("aboutReturn")) ? params.get("aboutReturn") : params.get("role") === "admin" ? "admin" : "feed";
  const role = params.get("role") === "admin" ? "admin" : "student";
  document.querySelectorAll("[data-policy-role]").forEach(item => {
    item.hidden = item.dataset.policyRole !== role;
  });
  const name = params.get("name");
  const welcome = document.querySelector("[data-policy-welcome]");
  if (name) {
    welcome.textContent = `Welcome, ${name}!`;
    welcome.hidden = false;
  }

  const back = document.querySelector("[data-policy-back]");
  back.setAttribute("href", returnRoute === "about" ? `/?return=${encodeURIComponent(aboutReturn)}#about` : `/#${returnRoute}`);
  document.querySelector("[data-policy-home]").setAttribute("href", `/#${role === "admin" ? "admin" : "feed"}`);
  back.addEventListener("click", () => {
    try { sessionStorage.setItem("retorno-role", role); } catch {}
  });

  const profile = document.querySelector(".profile-dropdown");
  const deletionAction = document.querySelector('[data-policy-action="deletion"]');
  const updateDeletionLabel = request => {
    if (deletionAction) deletionAction.textContent = request
      ? "Cancel account deletion request"
      : "Request account deletion";
  };
  const syncDeletionLabel = async () => {
    if (role !== "student" || !globalThis.RetornoAPI) return;
    try {
      const { request } = await globalThis.RetornoAPI.request("/account-deletion-request");
      updateDeletionLabel(request);
    } catch {
      // Keep the menu available; the action reports the error if the user selects it.
    }
  };
  profile.addEventListener("toggle", () => {
    if (profile.open) syncDeletionLabel();
  });
  if (profile.open) syncDeletionLabel();
  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-policy-nav]");
    if (nav) {
      const url = new URL(nav.dataset.policyNav, location.href);
      const targetRoute = url.hash.slice(1);
      url.searchParams.set("return", targetRoute === "about" ? aboutReturn : returnRoute);
      if (targetRoute === "about" || returnRoute === "about") url.searchParams.set("aboutReturn", aboutReturn);
      url.searchParams.set("role", role);
      if (name) url.searchParams.set("name", name);
      location.assign(url.pathname + url.search + url.hash);
      return;
    }
    const action = event.target.closest("[data-policy-action]");
    if (action) {
      const type = action.dataset.policyAction;
      if (type === "posts") {
        location.assign("/#mine");
      } else if (type === "admin-profile" || type === "register-admin") {
        location.assign("/#admin-profile");
      } else if (type === "logout") {
        if (!globalThis.RetornoAPI) return alert("The RETURNO server is unavailable.");
        globalThis.RetornoAPI.request("/logout", { method: "POST" })
          .then(() => {
            try { sessionStorage.removeItem("retorno-role"); } catch {}
            location.assign("/#role");
          })
          .catch(error => {
            if (error.status === 401) {
              try { sessionStorage.removeItem("retorno-role"); } catch {}
              location.assign("/#role");
            } else {
              alert(error.message || "Could not log out. Please try again.");
            }
          });
      } else if (type === "deletion") {
        if (!globalThis.RetornoAPI) return alert("The RETURNO server is unavailable.");
        action.disabled = true;
        globalThis.RetornoAPI.request("/account-deletion-request").then(async ({ request }) => {
          const cancelling = Boolean(request);
          updateDeletionLabel(request);
          const message = cancelling
            ? "Cancel your pending account deletion request?"
            : "Request account deletion? An administrator will review your request, and approval deletes your account and posts.";
          if (!window.confirm(message)) return;
          await globalThis.RetornoAPI.request("/account-deletion-request", {
            method: cancelling ? "DELETE" : "POST",
            ...(cancelling ? {} : { body: JSON.stringify({}) }),
          });
          updateDeletionLabel(!cancelling);
          if (!cancelling) alert("Your account deletion request was sent to an administrator.");
        }).catch(error => alert(error.message || "Could not update your account deletion request."))
          .finally(() => { action.disabled = false; });
      }
      return;
    }
    if (profile?.open && !profile.contains(event.target)) profile.open = false;
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && profile?.open) {
      profile.open = false;
      profile.querySelector("summary").focus();
    }
  });
})();

