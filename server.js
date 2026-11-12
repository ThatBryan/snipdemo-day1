import { randomBytes } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error("PORT must be an integer between 0 and 65535");
}

const configuredBaseUrl =
  process.env.BASE_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${port}`);
const baseUrl = new URL(configuredBaseUrl).origin.replace(/\/$/, "");
const publicDir = process.env.PUBLIC_DIR
  ? resolve(process.env.PUBLIC_DIR)
  : null;
const publicRoot = publicDir ? await realpath(publicDir) : null;
const links = new Map();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function createCode() {
  let code;
  do {
    code = "";
    while (code.length < 6) {
      for (const byte of randomBytes(16)) {
        if (byte < 248) code += alphabet[byte % alphabet.length];
        if (code.length === 6) break;
      }
    }
  } while (links.has(code));
  return code;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function isWithinPublicDir(filePath) {
  const pathFromRoot = relative(publicRoot, filePath);
  return (
    pathFromRoot === "" ||
    (pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromRoot))
  );
}

async function findPublicFile(pathname) {
  if (!publicDir) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const candidatePath = resolve(publicDir, relativePath);
  let filePath;
  try {
    filePath = await realpath(candidatePath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
  if (!isWithinPublicDir(filePath) || !(await stat(filePath)).isFile()) return null;

  const file = Bun.file(filePath);
  return file;
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (method === "POST" && url.pathname === "/api/links") {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ error: "Request body must be valid JSON" }, 400);
      }

      if (typeof payload?.url !== "string") {
        return json({ error: "url must be an HTTP or HTTPS URL" }, 400);
      }

      let originalUrl;
      try {
        originalUrl = new URL(payload.url);
      } catch {
        return json({ error: "url must be an HTTP or HTTPS URL" }, 400);
      }
      if (
        !["http:", "https:"].includes(originalUrl.protocol) ||
        !originalUrl.hostname
      ) {
        return json({ error: "url must be an HTTP or HTTPS URL" }, 400);
      }

      const code = createCode();
      const link = {
        code,
        url: originalUrl.href,
        shortUrl: `${baseUrl}/${code}`,
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.set(code, link);
      return json(link, 201);
    }

    if (method === "GET" && url.pathname === "/api/links") {
      return json([...links.values()]);
    }

    if (method === "GET" || method === "HEAD") {
      const file = await findPublicFile(url.pathname);
      if (file) {
        const headers = new Headers({
          "Access-Control-Allow-Origin": "*",
          "Content-Type": file.type || "application/octet-stream",
        });
        if (method === "HEAD") return new Response(null, { headers });
        return new Response(file, { headers });
      }
    }

    if (method === "GET" && /^\/[^/]+$/.test(url.pathname)) {
      const code = url.pathname.slice(1);
      const link = links.get(code);
      if (!link) return json({ error: "Link not found" }, 404);
      link.hits += 1;
      return Response.redirect(link.url, 302);
    }

    return json({ error: "Not found" }, 404);
  },
});

console.log(`Snip backend listening on port ${port}`);
