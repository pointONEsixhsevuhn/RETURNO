// Server-owned permission policy. No role/owner value from a request grants access.
const permissions = new Map([
  ["session.read", ["student", "admin"]],
  ["session.logout", ["student", "admin"]],
  ["posts.list", ["student", "admin"]],
  ["posts.create", ["student"]],
  ["posts.manage", ["admin"]],
  ["users.list", ["admin"]],
  ["stats.read", ["admin"]],
  ["admins.create", ["admin"]],
]);

export function authorize(user, permission) {
  if (!user?.id || !permissions.get(permission)?.includes(user.role))
    throw Object.assign(
      new Error("You do not have permission for this action."),
      { status: 403 },
    );
}

export function requestPermission(route, method) {
  const routes = new Map([
    ["GET /api/me", "session.read"],
    ["POST /api/logout", "session.logout"],
    ["GET /api/posts", "posts.list"],
    ["POST /api/posts", "posts.create"],
    ["GET /api/users", "users.list"],
    ["GET /api/stats", "stats.read"],
    ["POST /api/admins", "admins.create"],
  ]);
  if (
    /^\/api\/posts\/[a-zA-Z0-9-]+$/.test(route) &&
    ["GET", "PUT", "PATCH", "DELETE"].includes(method)
  )
    return "posts.manage";
  const permission = routes.get(`${method} ${route}`);
  if (!permission)
    throw Object.assign(new Error("Not found."), { status: 404 });
  return permission;
}

export function postReadScope(user, mine) {
  authorize(user, "posts.list");
  // The shared feed is intentional. Only the signed-in ID scopes the own-post list.
  return mine
    ? { sql: "p.user_id=?", params: [user.id] }
    : { sql: "1=1", params: [] };
}

// SQL predicates enforce the current stored role as well as the HTTP permission gate.
export const adminRowScope =
  "EXISTS(SELECT 1 FROM users actor WHERE actor.id=? AND actor.role='admin')";
export const studentRowScope =
  "EXISTS(SELECT 1 FROM users actor WHERE actor.id=? AND actor.role='student')";
