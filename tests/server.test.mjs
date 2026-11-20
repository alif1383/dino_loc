import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createAppServer } from "../scripts/server.mjs";

function httpRequest({ host, port, path, method = "GET" }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host, port, path, method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("Dual-stack server serves IPv4 and IPv6, MIME types, HEAD/OPTIONS, and blocks traversal", async () => {
  const server = createAppServer({ quiet: true });
  await new Promise((resolve) => server.listen({ port: 0, host: "::", ipv6Only: false }, resolve));
  const { port } = server.address();

  try {
    // 1. Both IPv4 (127.0.0.1) and IPv6 (::1) must succeed!
    const v4 = await httpRequest({ host: "127.0.0.1", port, path: "/" });
    const v6 = await httpRequest({ host: "::1", port, path: "/" });
    assert.equal(v4.status, 200);
    assert.equal(v6.status, 200);
    assert.match(v4.headers["content-type"], /text\/html/);
    assert.equal(v4.body.length, v6.body.length);
    assert.ok(v4.body.toString("utf8").includes("DeepTime Earth"));

    // 2. HEAD returns Content-Length with empty body
    const head = await httpRequest({ host: "127.0.0.1", port, path: "/data/plates_data.json", method: "HEAD" });
    assert.equal(head.status, 200);
    assert.match(head.headers["content-type"], /application\/json/);
    assert.ok(Number(head.headers["content-length"]) > 10000);
    assert.equal(head.body.length, 0);

    // 3. OPTIONS returns 204 with CORS headers
    const opt = await httpRequest({ host: "::1", port, path: "/index.html", method: "OPTIONS" });
    assert.equal(opt.status, 204);
    assert.equal(opt.headers["access-control-allow-origin"], "*");

    // 4. Static assets MIME types
    const js = await httpRequest({ host: "127.0.0.1", port, path: "/src/app.js" });
    assert.equal(js.status, 200);
    assert.match(js.headers["content-type"], /text\/javascript/);

    const css = await httpRequest({ host: "127.0.0.1", port, path: "/styles.css" });
    assert.equal(css.status, 200);
    assert.match(css.headers["content-type"], /text\/css/);

    const jpg = await httpRequest({ host: "127.0.0.1", port, path: "/assets/textures/earth_modern.jpg" });
    assert.equal(jpg.status, 200);
    assert.equal(jpg.headers["content-type"], "image/jpeg");
    assert.ok(jpg.body.length > 50000);

    // 5. Security & Error handling
    const trav = await httpRequest({ host: "127.0.0.1", port, path: "/%2e%2e/etc/passwd" });
    assert.equal(trav.status, 403);

    const notFound = await httpRequest({ host: "127.0.0.1", port, path: "/does-not-exist.png" });
    assert.equal(notFound.status, 404);

    const badMethod = await httpRequest({ host: "127.0.0.1", port, path: "/", method: "POST" });
    assert.equal(badMethod.status, 405);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
