import { randomUUID } from "node:crypto";
import { test, expect, verificationCodes } from "./fixtures.js";

async function tabTo(page, locator) {
  for (let count = 0; count < 30; count++) {
    if (await locator.evaluate((node) => node === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  await expect(locator, "Control must be reachable by Tab").toBeFocused();
}
async function activate(page, locator) {
  await tabTo(page, locator);
  await page.keyboard.press("Enter");
}
async function typeInto(page, locator, value) {
  await tabTo(page, locator);
  await page.keyboard.type(value);
}
async function fits(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
const pass = "KeyboardStudent123!";

test("keyboard-only registration, report controls, card dialogs, search and logout", async ({
  page,
}) => {
  await page.goto("/#role");
  await activate(
    page,
    page.getByRole("button", { name: "Student", exact: true }),
  );
  await activate(
    page,
    page.getByRole("tab", { name: "Register", exact: true }),
  );
  const email = `keyboard-${randomUUID()}@e2e.example`;
  await typeInto(page, page.getByLabel("Enter gmail"), email);
  await typeInto(
    page,
    page.getByLabel("Full name", { exact: true }),
    "Keyboard Test Student With A Long Display Name",
  );
  await typeInto(page, page.getByLabel("Set password", { exact: true }), pass);
  await typeInto(
    page,
    page.getByLabel("Confirm password", { exact: true }),
    pass,
  );
  await fits(page);
  await activate(
    page,
    page.getByRole("button", { name: "Register", exact: true }),
  );
  await expect(
    page.getByRole("heading", { name: "Confirm your email" }),
  ).toBeVisible();
  await fits(page);
  await typeInto(
    page,
    page.getByLabel("Verification code"),
    verificationCodes.get(email),
  );
  await activate(
    page,
    page.getByRole("button", { name: "Confirm email", exact: true }),
  );
  await expect(
    page.getByRole("heading", { name: "Welcome, Keyboard Test Student With A Long Display Name!" }),
  ).toBeVisible();
  await activate(
    page,
    page.getByRole("button", { name: "Your posts", exact: true }),
  );
  await activate(
    page,
    page.getByRole("button", { name: "Add post", exact: true }),
  );
  await activate(page, page.locator("#status-trigger"));
  await expect(page.locator("#status-trigger")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await activate(page, page.getByRole("button", { name: "Lost", exact: true }));
  await expect(page.locator("#status-trigger")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await typeInto(
    page,
    page.getByLabel("Item name:", { exact: true }),
    "Keyboard report field",
  );
  await fits(page);
  await activate(
    page,
    page.getByRole("button", { name: "Cancel", exact: true }),
  );
  await expect(
    page.getByRole("heading", { name: "Welcome, Keyboard Test Student With A Long Display Name!" }),
  ).toBeVisible();

  // Seed a record through the isolated API; the card/dialog interactions are keyboard-only.
  const item = `Keyboard item ${randomUUID().slice(0, 8)}`;
  const made = await page.request.post("/api/posts", {
    data: {
      kind: "Found",
      item_name: item,
      event_at: "2026-10-06T12:30",
      location: "Library",
      description: "Long description ".repeat(40),
    },
  });
  expect(made.status()).toBe(201);
  await activate(page, page.getByRole("button", { name: "Home", exact: true }));
  const card = page.getByRole("button", {
    name: `View details for ${item}`,
    exact: true,
  });
  await expect(card).toBeVisible();
  await tabTo(page, card);
  expect(
    await card.evaluate((node) => getComputedStyle(node).outlineStyle),
  ).not.toBe("none");
  await page.keyboard.press("Space");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(item);
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  // Native dialogs permit tabbing to browser chrome; Shift+Tab must return inside.
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(card).toBeFocused();
  await page.keyboard.press("Enter");
  await activate(
    page,
    dialog.getByRole("button", { name: "Close", exact: true }),
  );
  await expect(card).toBeFocused();
  await activate(
    page,
    page.getByRole("button", { name: "Search", exact: true }),
  );
  await typeInto(
    page,
    page.getByRole("searchbox", { name: "Search posts" }),
    item,
  );
  await page.keyboard.press("Enter");
  await expect(card).toBeVisible();
  await fits(page);
  await activate(
    page,
    page.getByRole("button", { name: "Log out", exact: true }),
  );
  await expect(
    page.getByRole("button", { name: "Student", exact: true }),
  ).toBeVisible();
});

test("keyboard login errors, password toggle and loading/retry states", async ({
  page,
}) => {
  await page.goto("/#role");
  await activate(
    page,
    page.getByRole("button", { name: "Admin", exact: true }),
  );
  await typeInto(
    page,
    page.getByLabel("Email", { exact: true }),
    "admin@e2e.example",
  );
  await typeInto(
    page,
    page.getByLabel("Password", { exact: true }),
    "WrongPassword123!",
  );
  await activate(
    page,
    page.getByRole("button", { name: "Show password", exact: true }),
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await activate(
    page,
    page.getByRole("button", { name: "Log In", exact: true }),
  );
  await expect(page.getByRole("alert")).toContainText(
    "Incorrect email, password, or role.",
  );
  await fits(page);
  await tabTo(page, page.getByLabel("Password", { exact: true }));
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("BrowserAdmin123!");
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/posts?*",
    async (route) => {
      await gate;
      await route.abort();
    },
    { times: 1 },
  );
  await activate(
    page,
    page.getByRole("button", { name: "Log In", exact: true }),
  );
  const loading = page.getByRole("status");
  await expect(loading).toHaveText("Loading dashboard...");
  await expect(loading).toHaveAttribute("aria-busy", "true");
  await fits(page);
  release();
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Cannot connect");
  await activate(page, retry);
  await expect(
    page.getByRole("heading", { name: "Registered users" }),
  ).toHaveCount(0);
  await expect(page.locator(".stats")).toHaveCount(0);
  await expect(page.locator("[data-admin-filter] .filter-count")).toHaveCount(5);
  await activate(
    page,
    page.getByRole("button", { name: "Admin profile", exact: true }),
  );
  await expect(
    page.getByRole("heading", { name: "Registered users" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Student users", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Admin users", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".stats")).toHaveCount(0);
  await expect(page.locator(".user-groups > section").first()).toHaveAttribute(
    "aria-label",
    "Admin users",
  );
  await fits(page);
  await activate(
    page,
    page.getByRole("button", { name: "Log out", exact: true }),
  );
  await expect(
    page.getByRole("button", { name: "Student", exact: true }),
  ).toBeVisible();
});
