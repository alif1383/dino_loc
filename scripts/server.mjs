#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

export function createAppServer({ root = DEFAULT_ROOT, quiet = false } = {}) {
  const absRoot = path.resolve(root);

  return http.createServer((req, res) => {
    const method = (req.method || "GET").toUpperCase();

    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "*"
      });
      res.end();
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method Not Allowed");
      return;
    }

    let rawPath;
    try {
      rawPath = decodeURIComponent((req.url || "/").split("?")[0]);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad Request");
      return;
    }

    // Prevent directory traversal attempts before POSIX normalization strips leading '..'
    if (rawPath.split(/[\\/]/).includes("..")) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    const normalized = path.posix.normalize(rawPath);

    const rel = normalized === "/" ? "/index.html" : normalized;
    const fullPath = path.resolve(absRoot, "." + rel);

    if (!fullPath.startsWith(absRoot + path.sep) && fullPath !== absRoot) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    fs.stat(fullPath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        if (!quiet) console.log(`${method} ${rawPath} -> 404`);
        return;
      }

      const ext = path.extname(fullPath).toLowerCase();
      const headers = {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Length": stat.size,
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": ext === ".jpg" || ext === ".png" ? "public, max-age=3600" : "no-cache"
      };

      res.writeHead(200, headers);
      if (method === "HEAD") {
        res.end();
      } else {
        const stream = fs.createReadStream(fullPath);
        stream.on("error", () => {
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });
        stream.pipe(res);
      }

      if (!quiet) {
        console.log(`${method} ${rawPath} -> 200 (${stat.size}B)`);
      }
    });
  });
}

// Run standalone when executed directly
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const PORT = Number(process.env.PORT || 4173);
  const server = createAppServer();
  // Dual-stack IPv6 + IPv4 bind (accepts BOTH http://127.0.0.1:4173 AND http://[::1]:4173!)
  server.listen({ port: PORT, host: "::", ipv6Only: false }, () => {
    console.log(`DeepTime Earth server running (IPv4 + IPv6 dual-stack) on port ${PORT}`);
  });
}
