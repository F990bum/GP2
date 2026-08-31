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

const REFERENCE = [
  "세종은 우리나라 말이 중국과 달라 한자와 서로 통하지 않아, 글을 모르는 백성이 뜻을 펴기 어려운 것을 안타깝게 여겼다.",
  "이에 누구나 쉽게 익혀 날마다 편리하게 쓰도록 새 문자 훈민정음을 만들었다.",
  "훈민정음은 1443년에 창제되고 1446년에 반포되었다.",
  "훈민정음 해례본에는 글자를 만든 원리와 사용법이 설명되어 있다.",
  "창제 당시에는 사대부의 반대가 있었고, 공식 문서에서는 한동안 한자가 함께 쓰였다.",
  "훈민정음은 발음 기관의 모양을 본떠 자음을 만들고, 하늘과 땅과 사람을 본떠 모음을 만들었다.",
].join(" ");

const SUPPORTED_SENTENCES = [
  "세종은 글을 모르는 백성이 뜻을 펴기 어려운 것을 안타깝게 여겼습니다.",
  "그래서 누구나 쉽게 익혀 날마다 편리하게 쓸 수 있는 새 문자를 만들었습니다.",
  "훈민정음은 1443년에 창제되었습니다.",
  "반포는 1446년에 이루어졌습니다.",
  "해례본에는 글자를 만든 원리와 사용법이 설명되어 있습니다.",
  "창제 당시에는 사대부의 반대가 있었습니다.",
  "공식 문서에서는 한동안 한자가 함께 쓰였습니다.",
  "자음은 발음 기관의 모양을 본떠 만들었습니다.",
  "모음은 하늘과 땅과 사람을 본떠 만들었습니다.",
  "훈민정음은 백성을 위해 만들어진 문자입니다.",
];

function checkSupported(sentenceCount: number) {
  return analyzeAnswer({
    question: "훈민정음에 대해 설명해 줘.",
    answer: SUPPORTED_SENTENCES.slice(0, sentenceCount).join(" "),
    referenceText: REFERENCE,
  });
}

test("scores stay stable as a well-supported answer gets longer", () => {
  const scores = [1, 2, 3, 5, 7, 10].map((count) => {
    const report = checkSupported(count);
    assert.notEqual(report.score, null, `${count}문장 답변이 치명적 오류로 판정되면 안 됩니다`);
    return report.score as number;
  });

  const lowest = Math.min(...scores);
  const highest = Math.max(...scores);
  assert.ok(lowest >= 80, `가장 낮은 점수 ${lowest}점은 근거가 충분한 답변에 비해 낮습니다`);
  assert.ok(
    highest - lowest <= 10,
    `길이만 달라졌는데 점수가 ${lowest}~${highest}로 벌어졌습니다`,
  );
});

test("does not invent unsupported sentences as an answer gets longer", () => {
  for (const count of [3, 7, 10]) {
    const report = checkSupported(count);
    assert.equal(
      report.unsupportedCount,
      0,
      `${count}문장 모두 자료에 있는 내용인데 ${report.unsupportedCount}개가 근거 부족으로 잡혔습니다`,
    );
    assert.ok(report.metrics.grounding >= 70, `근거성 ${report.metrics.grounding}점`);
  }
});

test("matches Korean verb endings across their conjugations", () => {
  const report = analyzeAnswer({
    question: "언제 만들었나요?",
    answer: "세종은 새 문자 훈민정음을 만들었습니다.",
    referenceText: "이에 누구나 쉽게 익혀 날마다 편리하게 쓰도록 세종은 새 문자 훈민정음을 만들었다.",
  });

  assert.equal(report.findings[0].level, "good");
  assert.ok(
    report.findings[0].evidenceScore >= 70,
    `어미만 다른 문장인데 근거 연결이 ${report.findings[0].evidenceScore}%입니다`,
  );
});

test("finds evidence that is split across two reference sentences", () => {
  const report = analyzeAnswer({
    question: "훈민정음은 언제 만들어지고 언제 알려졌나요?",
    answer: "훈민정음은 1443년에 창제되어 1446년에 반포되었습니다.",
    referenceText: "훈민정음은 1443년에 창제되었다. 그리고 1446년에 반포되었다.",
  });

  assert.equal(report.fatalErrors.length, 0);
  assert.equal(report.unsupportedCount, 0);
});

test("treats an added number as missing evidence, not as a conflict", () => {
  const report = analyzeAnswer({
    question: "훈민정음은 몇 글자인가요?",
    answer: "훈민정음은 자음 17자와 모음 11자, 모두 28자로 이루어졌습니다.",
    referenceText: REFERENCE,
  });

  assert.equal(report.fatalErrors.length, 0);
  assert.equal(report.findings[0].level, "warning");
  assert.equal(report.findings[0].label, "근거 부족");
});

test("still catches a same-kind number that the source states differently", () => {
  const report = analyzeAnswer({
    question: "문맹률은 얼마나 떨어졌나요?",
    answer: "이 정책으로 문맹률은 10%까지 떨어졌습니다.",
    referenceText: "이 정책 이후 문맹률은 32%까지 떨어졌다.",
  });

  assert.equal(report.verdict, "사용 비추천");
  assert.equal(report.score, null);
});

test("does not read a negation in an earlier clause as a contradiction", () => {
  const report = analyzeAnswer({
    question: "세종은 무엇을 안타깝게 여겼나요?",
    answer: "세종은 글을 모르는 백성이 뜻을 펴기 어려운 것을 안타깝게 여겼습니다.",
    referenceText:
      "세종은 우리나라 말이 중국과 달라 한자와 서로 통하지 않아, 글을 모르는 백성이 뜻을 펴기 어려운 것을 안타깝게 여겼다.",
  });

  assert.equal(report.fatalErrors.length, 0);
  assert.notEqual(report.findings[0].level, "critical");
});

test("catches a reversed direction word against the source", () => {
  const report = analyzeAnswer({
    question: "한글 사용은 어떻게 됐나요?",
    answer: "한글 사용 비율은 그 뒤로 계속 감소했습니다.",
    referenceText: "한글 사용 비율은 그 뒤로 계속 증가했다.",
  });

  assert.equal(report.verdict, "사용 비추천");
  assert.ok(report.fatalErrors.length > 0);
});

test("does not punish the repeated polite endings of natural Korean", () => {
  const report = checkSupported(10);
  assert.ok(
    report.metrics.diversity >= 80,
    `한국어 어미 반복만으로 표현 다양성이 ${report.metrics.diversity}점까지 떨어졌습니다`,
  );
});

test("keeps flagging an answer that the source does not cover", () => {
  const report = analyzeAnswer({
    question: "세종의 다른 업적은?",
    answer:
      "장영실은 자격루라는 물시계를 만들었습니다. 농사직설은 농업 기술을 정리한 책입니다. 조선의 세법은 공법이라는 이름으로 정비되었습니다.",
    referenceText: REFERENCE,
  });

  assert.equal(report.verdict, "근거 추가 필요");
  assert.ok(report.unsupportedCount >= 3);
  assert.ok(report.metrics.grounding <= 25);
});
