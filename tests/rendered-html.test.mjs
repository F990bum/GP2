import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the GuPan product and Korean metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="ko"/i);
  assert.match(html, /<title>GuPan 2\.0 — 한국어 AI 답변 품질 방화벽<\/title>/i);
  assert.match(html, /AI가 AI의 답변만/);
  assert.match(html, /한국어 답변 검사 시작/);
  assert.match(html, /Human Anchor/i);
  assert.match(html, /COLLAPSE LAB/);
  assert.match(html, /og\.png/);
});

test("does not ship starter preview artifacts", async () => {
  const response = await render();
  const html = await response.text();
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
  assert.doesNotMatch(html, /Your site is taking shape/);
});
