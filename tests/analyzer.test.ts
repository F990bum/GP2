import assert from "node:assert/strict";
import test from "node:test";
import { analyzeAnswer, splitSentences } from "../lib/analyzer.ts";

test("flags missing human reference before grammar scores can pass", () => {
  const report = analyzeAnswer({
    question: "왜 필요한가요?",
    answer: "이 제도는 모든 사람에게 반드시 도움이 됩니다.",
    referenceText: "",
  });

  assert.equal(report.verdict, "근거 추가 필요");
  assert.equal(report.metrics.grounding, 0);
  assert.equal(report.unsupportedCount, 1);
});

test("treats a context-linked number conflict as fatal and hides the score", () => {
  const report = analyzeAnswer({
    question: "훈민정음은 언제 창제됐나요?",
    answer: "훈민정음은 1445년에 창제되었습니다.",
    referenceText: "훈민정음은 1443년에 창제되고 1446년에 반포되었다.",
    sourceUrl: "https://example.com/source",
  });

  assert.equal(report.verdict, "사용 비추천");
  assert.equal(report.score, null);
  assert.ok(report.fatalErrors.length > 0);
});

test("accepts a well-supported concise paraphrase without fatal issues", () => {
  const report = analyzeAnswer({
    question: "세종은 왜 훈민정음을 만들었나요?",
    answer: "세종은 글을 모르는 백성이 뜻을 쉽게 펴도록 훈민정음을 만들었다.",
    referenceText: "세종은 글을 모르는 백성이 뜻을 펴기 어려운 것을 안타깝게 여겨 누구나 쉽게 익힐 수 있는 훈민정음을 만들었다.",
  });

  assert.equal(report.fatalErrors.length, 0);
  assert.notEqual(report.verdict, "사용 비추천");
  assert.ok(report.metrics.grounding >= 60);
});

test("keeps decimals and URLs inside their sentence", () => {
  const sentences = splitSentences("값은 3.14입니다. 출처는 https://a.com/x 입니다. 다음 문장입니다.");
  assert.deepEqual(sentences, [
    "값은 3.14입니다.",
    "출처는 https://a.com/x 입니다.",
    "다음 문장입니다.",
  ]);
});

test("is deterministic for identical input", () => {
  const input = {
    question: "질문",
    answer: "자료는 답변의 근거가 된다.",
    referenceText: "검증된 자료는 답변의 근거가 된다.",
  };
  assert.deepEqual(analyzeAnswer(input), analyzeAnswer(input));
});
