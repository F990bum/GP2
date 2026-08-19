import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("builds a GitHub Pages entry with the /GP2/ base path", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");

  assert.match(html, /<html[^>]*lang="ko"/i);
  assert.match(html, /<title>GuPan 2\.0 — 한국어 AI 답변 품질 방화벽<\/title>/i);
  assert.match(html, /(?:src|href)="\/GP2\/assets\//);
  assert.match(html, /https:\/\/f990bum\.github\.io\/GP2\/og\.png/);
  assert.doesNotMatch(html, /chatgpt\.site|codex-preview|vinext/i);
});

test("emits the app bundle and social image", async () => {
  const assets = await readdir(new URL("../dist/assets/", import.meta.url));
  assert.ok(assets.some((file) => file.endsWith(".js")));
  assert.ok(assets.some((file) => file.endsWith(".css")));
  await access(new URL("../dist/og.png", import.meta.url));
});
