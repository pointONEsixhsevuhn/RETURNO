import { randomUUID } from "node:crypto";

const bucket = process.env.SUPABASE_STORAGE_BUCKET || "retorno-images";

function config() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Supabase Storage is not configured.");
  const url = new URL(base);
  if (url.protocol !== "https:" && process.env.NODE_ENV !== "test")
    throw new Error("Supabase Storage must use HTTPS.");
  const secretKey = /^sb_secret_[A-Za-z0-9_-]+$/.test(key);
  if (!secretKey) {
    const parts = key.split(".");
    let role;
    try {
      role = JSON.parse(Buffer.from(parts[1] || "", "base64url").toString("utf8")).role;
    } catch {}
    if (parts.length !== 3 || role !== "service_role")
      throw new Error("Configure a Supabase secret key or legacy service-role key.");
  }
  return { base: url.origin, key, useBearer: !secretKey };
}

function objectUrl(path, mode = "object") {
  const { base } = config();
  return `${base}/storage/v1/${mode}/${encodeURIComponent(bucket)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

async function storageRequest(url, options = {}) {
  const { key, useBearer } = config();
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: key,
      ...(useBearer ? { Authorization: `Bearer ${key}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = new Error(`Supabase Storage request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return response;
}

export async function createImageUpload(userId, mimeType) {
  const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[mimeType];
  if (!extension) throw Object.assign(new Error("Use a PNG, JPEG, or WebP image."), { status: 400 });
  const path = `${userId}/${randomUUID()}.${extension}`;
  const response = await storageRequest(objectUrl(path, "object/upload/sign"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const result = await response.json();
  const signed = new URL(`${config().base}/storage/v1${result.url}`);
  const token = signed.searchParams.get("token");
  if (!token) throw new Error("Supabase did not return an upload token.");
  const uploadUrl = objectUrl(path, "object/upload/sign");
  const directUrl = new URL(uploadUrl);
  directUrl.searchParams.set("token", token);
  return { path, uploadUrl: directUrl.toString() };
}

export async function downloadImage(path) {
  return storageRequest(objectUrl(path, "object"));
}

export async function replaceImage(path, bytes, mimeType) {
  await storageRequest(objectUrl(path), {
    method: "PUT",
    headers: { "Content-Type": mimeType, "x-upsert": "true" },
    body: bytes,
  });
}

export async function deleteImage(path) {
  if (!path) return;
  const { base } = config();
  await storageRequest(`${base}/storage/v1/object/${encodeURIComponent(bucket)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [path] }),
  });
}

export function imageUrl(postId) {
  return `/api/post-images/${encodeURIComponent(postId)}`;
}

export function storageOrigin() {
  if (!process.env.SUPABASE_URL) return null;
  try {
    const url = new URL(process.env.SUPABASE_URL);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}
