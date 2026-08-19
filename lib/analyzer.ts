export type Verdict = "사용 가능" | "수정 후 사용" | "근거 추가 필요" | "사용 비추천";

export type CheckInput = {
  question: string;
  answer: string;
  referenceText: string;
  sourceUrl?: string;
  purpose?: string;
};

export type MetricKey =
  | "grounding"
  | "accuracy"
  | "koreanQuality"
  | "diversity"
  | "information"
  | "transparency";

export type Finding = {
  id: number;
  sentence: string;
  level: "critical" | "warning" | "style" | "good";
  label: string;
  issue: string;
  evidence: string;
  suggestion: string;
  evidenceScore: number;
};

export type AnalysisResult = {
  verdict: Verdict;
  score: number | null;
  summary: string;
  metrics: Record<MetricKey, number>;
  fatalErrors: string[];
  unsupportedCount: number;
  findings: Finding[];
  revisedAnswer: string;
};

const STOP_WORDS = new Set([
  "그리고", "그러나", "하지만", "따라서", "때문", "통해", "대한", "대해", "위해",
  "것으로", "것이다", "있습니다", "합니다", "됩니다", "하는", "있는", "하며", "이는",
  "에서", "으로", "에게", "까지", "부터", "보다", "또한", "이러한", "그러한", "매우",
]);

const ABSOLUTE_PHRASES = [
  "모든", "항상", "절대로", "완전히", "반드시", "즉시", "유일", "무조건", "100%", "0%",
];

const TRANSLATIONESE = [
  ["~에 대한", ""],
  ["그것은", "이는"],
  ["관점에서 볼 때", "관점에서"],
  ["사실을 감안할 때", "점을 고려하면"],
  ["하는 것이 가능하다", "할 수 있다"],
  ["에 의하여", "에 의해"],
] as const;

export const METRIC_LABELS: Record<MetricKey, string> = {
  grounding: "근거성",
  accuracy: "의미 정확성",
  koreanQuality: "한국어 품질",
  diversity: "표현 다양성",
  information: "정보 보존",
  transparency: "투명성",
};

function clamp(value: number, min = 0, max = 100) {
  return Math.round(Math.min(max, Math.max(min, value)));
}

export function splitSentences(text: string) {
  return text
    .replace(/\r/g, " ")
    .replace(/([.!?。！？])(?=\s|$)/g, "$1\n")
    .split(/\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function tokenize(text: string) {
  return Array.from(
    new Set(
      (text.toLowerCase().match(/[가-힣a-z0-9]+/g) ?? [])
        .map((token) => token.replace(/(은|는|이|가|을|를|의|에|도|와|과|로|으로|에서|에게)$/u, ""))
        .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)),
    ),
  );
}

function similarity(left: string, right: string) {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (!leftTokens.length || !rightTokens.length) return 0;
  const rightSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightSet.has(token)).length;
  const containment = shared / Math.min(leftTokens.length, rightTokens.length);
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return Math.min(1, containment * 0.72 + (shared / union) * 0.28);
}

function numbers(text: string) {
  return text.match(/\d+(?:\.\d+)?%?/g) ?? [];
}

function hasNegation(text: string) {
  return /(않|아니|없|못|금지|반대|줄지|감소)/.test(text);
}

function validSourceUrl(sourceUrl?: string) {
  if (!sourceUrl?.trim()) return true;
  try {
    const parsed = new URL(sourceUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function repeatedPhrasePenalty(sentences: string[]) {
  if (sentences.length < 2) return 0;
  const endings = sentences.map((sentence) => sentence.replace(/[.!?]/g, "").slice(-5));
  const repeatedEndings = endings.length - new Set(endings).size;
  const words = sentences.join(" ").match(/[가-힣a-zA-Z]{2,}/g) ?? [];
  const pairs = words.slice(0, -1).map((word, index) => `${word} ${words[index + 1]}`);
  const repeatedPairs = pairs.length - new Set(pairs).size;
  return repeatedEndings * 9 + Math.min(24, repeatedPairs * 2.5);
}

function koreanQualityScore(answer: string, sentences: string[]) {
  const letters = answer.match(/[가-힣a-zA-Z]/g) ?? [];
  const english = answer.match(/[a-zA-Z]/g) ?? [];
  const englishRatio = letters.length ? english.length / letters.length : 0;
  const translationeseCount = TRANSLATIONESE.filter(([phrase]) => answer.includes(phrase)).length;
  const longSentenceCount = sentences.filter((sentence) => sentence.length > 120).length;
  const awkwardSpacing = (answer.match(/\s{2,}/g) ?? []).length;
  return clamp(96 - englishRatio * 150 - translationeseCount * 7 - longSentenceCount * 7 - awkwardSpacing * 3);
}

function sourceEvidence(sentence: string, references: string[]) {
  let bestSentence = "";
  let bestScore = 0;
  references.forEach((reference) => {
    const score = similarity(sentence, reference);
    if (score > bestScore) {
      bestScore = score;
      bestSentence = reference;
    }
  });
  return { bestSentence, bestScore };
}

function softenAbsolute(sentence: string) {
  return sentence
    .replace(/모든/g, "많은")
    .replace(/항상/g, "대체로")
    .replace(/절대로/g, "쉽게")
    .replace(/완전히/g, "상당 부분")
    .replace(/반드시/g, "대체로")
    .replace(/즉시/g, "점차")
    .replace(/단숨에/g, "점차");
}

export function analyzeAnswer(input: CheckInput): AnalysisResult {
  const answerSentences = splitSentences(input.answer);
  const referenceSentences = splitSentences(input.referenceText);
  const invalidSource = !validSourceUrl(input.sourceUrl);
  const hasReference = referenceSentences.length > 0;
  const fatalErrors: string[] = [];
  let contradictionCount = 0;
  let unsupportedCount = 0;

  if (invalidSource) fatalErrors.push("출처 URL 형식을 확인할 수 없습니다.");

  const findings: Finding[] = answerSentences.map((sentence, index) => {
    const { bestSentence, bestScore } = sourceEvidence(sentence, referenceSentences);
    const answerNumbers = numbers(sentence);
    const referenceNumbers = numbers(input.referenceText);
    const mismatchedNumber =
      hasReference &&
      bestScore >= 0.18 &&
      answerNumbers.some((number) => !referenceNumbers.includes(number)) &&
      referenceNumbers.length > 0;
    const negationConflict =
      bestScore >= 0.34 && bestSentence && hasNegation(sentence) !== hasNegation(bestSentence);
    const absolute = ABSOLUTE_PHRASES.find((phrase) => sentence.includes(phrase));
    const translationese = TRANSLATIONESE.find(([phrase]) => sentence.includes(phrase));

    if (mismatchedNumber || negationConflict) {
      contradictionCount += 1;
      const label = mismatchedNumber ? "수치 불일치" : "의미 충돌";
      return {
        id: index + 1,
        sentence,
        level: "critical" as const,
        label,
        issue: mismatchedNumber
          ? "답변의 핵심 수치가 인간 기준 자료에서 확인되지 않습니다."
          : "답변과 기준 자료의 긍정·부정 방향이 서로 다릅니다.",
        evidence: bestSentence || "기준 자료에서 대응 문장을 찾지 못했습니다.",
        suggestion: bestSentence || softenAbsolute(sentence),
        evidenceScore: clamp(bestScore * 100),
      };
    }

    if (!hasReference || bestScore < 0.24) {
      unsupportedCount += 1;
      return {
        id: index + 1,
        sentence,
        level: "warning" as const,
        label: "근거 부족",
        issue: hasReference
          ? "이 주장을 뒷받침하는 내용을 인간 기준 자료에서 충분히 찾지 못했습니다."
          : "대조할 인간 기준 자료가 입력되지 않았습니다.",
        evidence: bestSentence || "연결된 근거 없음",
        suggestion: bestSentence || `${softenAbsolute(sentence)} (출처 확인 필요)`,
        evidenceScore: clamp(bestScore * 100),
      };
    }

    if (absolute || translationese) {
      const suggestion = translationese
        ? sentence.replace(translationese[0], translationese[1])
        : softenAbsolute(sentence);
      return {
        id: index + 1,
        sentence,
        level: "style" as const,
        label: absolute ? "과도한 단정" : "번역투 표현",
        issue: absolute
          ? `“${absolute}”처럼 예외를 지우는 표현은 출처보다 강한 주장으로 읽힐 수 있습니다.`
          : "한국어에서 더 짧고 자연스럽게 쓸 수 있는 표현입니다.",
        evidence: bestSentence,
        suggestion,
        evidenceScore: clamp(bestScore * 100),
      };
    }

    return {
      id: index + 1,
      sentence,
      level: "good" as const,
      label: "근거 확인",
      issue: "기준 자료와 의미가 대체로 일치합니다.",
      evidence: bestSentence,
      suggestion: sentence,
      evidenceScore: clamp(bestScore * 100),
    };
  });

  if (contradictionCount > 0) {
    fatalErrors.push(`출처와 충돌하거나 확인되지 않는 핵심 수치 ${contradictionCount}개`);
  }

  const evidenceAverage = findings.length
    ? findings.reduce((sum, finding) => sum + finding.evidenceScore, 0) / findings.length
    : 0;
  const answerTokens = tokenize(input.answer);
  const referenceTokens = tokenize(input.referenceText);
  const answerTokenSet = new Set(answerTokens);
  const referenceCoverage = referenceTokens.length
    ? referenceTokens.filter((token) => answerTokenSet.has(token)).length / referenceTokens.length
    : 0;
  const absoluteCount = ABSOLUTE_PHRASES.reduce(
    (count, phrase) => count + (input.answer.split(phrase).length - 1),
    0,
  );

  const metrics: Record<MetricKey, number> = {
    grounding: hasReference ? clamp(evidenceAverage) : 0,
    accuracy: clamp(96 - contradictionCount * 42 - unsupportedCount * 7),
    koreanQuality: koreanQualityScore(input.answer, answerSentences),
    diversity: clamp(94 - repeatedPhrasePenalty(answerSentences)),
    information: hasReference ? clamp(referenceCoverage * 115) : 0,
    transparency: clamp(94 - unsupportedCount * 17 - absoluteCount * 7),
  };

  const weightedScore = clamp(
    metrics.grounding * 0.26 +
      metrics.accuracy * 0.22 +
      metrics.koreanQuality * 0.15 +
      metrics.diversity * 0.12 +
      metrics.information * 0.13 +
      metrics.transparency * 0.12,
  );

  let verdict: Verdict;
  let score: number | null = weightedScore;
  if (fatalErrors.length > 0) {
    verdict = "사용 비추천";
    score = null;
  } else if (!hasReference || unsupportedCount > 0) {
    verdict = "근거 추가 필요";
  } else if (weightedScore >= 82 && Object.values(metrics).every((value) => value >= 65)) {
    verdict = "사용 가능";
  } else {
    verdict = "수정 후 사용";
  }

  const summary = fatalErrors.length
    ? `${fatalErrors[0]} 치명적 오류가 세부 점수보다 먼저 적용되었습니다.`
    : unsupportedCount > 0
      ? `핵심 주장 ${unsupportedCount}개에 연결할 근거가 부족합니다.`
      : verdict === "사용 가능"
        ? "치명적 오류가 없고 주요 주장이 기준 자료와 대체로 일치합니다."
        : "치명적 오류는 없지만 표현과 정보 보존을 다듬어야 합니다.";

  const revisedAnswer = findings
    .map((finding) => finding.suggestion)
    .filter(Boolean)
    .filter((sentence, index, array) => array.indexOf(sentence) === index)
    .join(" ");

  return {
    verdict,
    score,
    summary,
    metrics,
    fatalErrors,
    unsupportedCount,
    findings,
    revisedAnswer,
  };
}
