/**
 * 한국어 AI 답변 검사기.
 *
 * 설계 원칙
 * 1. 점수는 답변 길이에 좌우되지 않는다. 모든 감점은 "몇 개"가 아니라 "전체 중 몇 %"로 계산한다.
 * 2. 근거 대조는 참조 자료의 문장 하나가 아니라 인접 문장 묶음과 전체 본문까지 함께 본다.
 * 3. 한국어 조사·어미를 정규화해서 "만들었습니다"와 "만들었다"가 같은 낱말로 취급되게 한다.
 * 4. 수치 충돌은 "같은 종류의 숫자를 자료가 다르게 말할 때"만 치명적으로 본다.
 */

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
  "그리고", "그러나", "하지만", "따라서", "그래서", "또한", "이러한", "그러한", "저러한", "매우",
  "때문", "통해", "대한", "대해", "위해", "관해", "관련", "경우", "정도", "가지", "부분", "내용",
  "것으로", "것이다", "것입니다", "있습니다", "합니다", "됩니다", "이다", "하는", "있는", "하며",
  "이는", "에서", "으로", "에게", "까지", "부터", "보다", "그것", "이것", "저것", "우리", "저희",
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

/** 용언 어미. 긴 것부터 확인해야 "하였습니다"가 "습니다"로 잘리지 않는다. */
const VERB_TAILS = [
  "하였습니다", "되었습니다", "되었습니까", "하였습니까", "했었습니다", "됐었습니다",
  "이었습니다", "였습니다", "했습니다", "됐습니다", "합니다", "입니다", "습니다",
  "하였다", "되었다", "이었다", "하겠다", "되겠다", "했으며", "됐으며",
  "했다", "됐다", "였다", "한다", "된다", "이다", "있다", "없다",
  "하는", "되는", "하고", "되고", "하며", "되며", "하여", "되어", "해서", "돼서",
  "하지", "되지", "하면", "되면",
  "한", "된", "할", "될", "함", "됨",
];

/** 조사. 마찬가지로 긴 것부터 본다. */
const JOSA = [
  "으로써", "으로서", "이라고", "에서의", "에게서", "에서는", "으로는", "에게는",
  "라고", "으로", "에서", "에게", "께서", "한테", "보다", "처럼", "까지", "부터", "마저", "조차",
  "이나", "이란", "이며", "은", "는", "이", "가", "을", "를", "의", "에", "도", "와", "과",
  "로", "만", "랑", "며", "요",
];

/** 어간이 이보다 짧아지면 자르지 않는다. "국가"에서 "가"를 떼어 "국"이 되는 것을 막는다. */
const MIN_STEM_LENGTH = 2;

/** 근거 판정 문턱. 정규화된 유사도 기준으로 재보정한 값이다. */
const SUPPORTED_THRESHOLD = 0.34;
/**
 * 충돌 판정에 필요한 공통 내용어 개수.
 * 문장 전체 유사도로 막으면, 답변이 자료에 없는 설명을 덧붙였을 때 정작 틀린 수치를 놓친다.
 * "같은 대상을 말하고 있는가"만 확인하고 값 자체는 따로 비교한다.
 */
const CONFLICT_SHARED_TOKENS = 2;
/** 내용어가 이보다 적은 문장은 사실 주장으로 보지 않는다. 연결 문장이 근거 부족으로 세지는 것을 막는다. */
const MIN_CLAIM_TOKENS = 2;
/** 이 비율을 넘게 근거가 비면 근거 추가 필요로 판정한다. */
const UNSUPPORTED_VERDICT_RATIO = 0.25;
/** 전체 본문 매칭은 근거 문장을 특정하지 못하므로 살짝 깎아 문장 단위 매칭을 우선한다. */
const WHOLE_DOCUMENT_DISCOUNT = 0.94;

const METRIC_WEIGHTS: Record<MetricKey, number> = {
  grounding: 0.26,
  accuracy: 0.22,
  koreanQuality: 0.15,
  diversity: 0.12,
  information: 0.13,
  transparency: 0.12,
};

/**
 * 기준 자료가 있어야만 잴 수 있는 지표.
 * 자료를 넣지 않았을 때 이 둘이 0점인 것은 "답변이 나쁘다"가 아니라 "확인하지 못했다"는 뜻이다.
 * 확인하지 못한 항목을 0점으로 총점에 넣으면 어떤 답변이든 60점을 넘을 수 없어,
 * 자료를 넣지 않은 사용자에게 사실과 다른 신호를 준다. 그래서 총점 계산에서 빼고 나머지를 정규화한다.
 * 대신 판정은 계속 "근거 추가 필요"로 남겨 확인되지 않았다는 사실 자체를 감추지 않는다.
 */
const SOURCE_DEPENDENT_METRICS: readonly MetricKey[] = ["grounding", "information"];

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

function ratio(part: number, whole: number) {
  return whole > 0 ? part / whole : 0;
}

/** 표 구분선(`|---|:--:|`)인지. 내용이 없으므로 통째로 버린다. */
const TABLE_DIVIDER = /^\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/;
/** 수평선(`---`, `***`, `___`). */
const HORIZONTAL_RULE = /^([-*_])\s*(?:\1\s*){2,}$/;

/**
 * AI 답변은 대개 마크다운으로 온다.
 * `###`, `**굵게**`, 표, 인용, 목록 기호를 걷어 내고 문장만 남긴다.
 * 이 과정을 건너뛰면 제목과 표 행이 통째로 한 문장이 되어 근거 대조가 무너진다.
 */
export function normalizeMarkdown(text: string): string {
  const withoutBlocks = text
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/~~~[\s\S]*?~~~/g, "\n")
    .replace(/`([^`\n]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>\n]+>/g, " ");

  const lines = withoutBlocks.split(/\r?\n/).map((rawLine) => {
    const line = rawLine.trim();
    if (!line || HORIZONTAL_RULE.test(line) || TABLE_DIVIDER.test(line)) return "";
    let content = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^>\s?/, "")
      .replace(/^(?:[-*+]|\d+[.)])\s+/, "");
    if (content.startsWith("|")) {
      // 표 한 줄은 칸을 쉼표로 이어 붙여 하나의 진술로 다룬다.
      content = content
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(", ");
    }
    return content;
  });

  return lines
    .join("\n")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function splitSentences(text: string) {
  return text
    .replace(/\r/g, " ")
    .replace(/([.!?。！？])(?=\s|$)/g, "$1\n")
    .split(/\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function stripSuffix(token: string, suffixes: string[]) {
  for (const suffix of suffixes) {
    if (token.length - suffix.length >= MIN_STEM_LENGTH && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

/** 조사와 용언 어미를 반복해서 떼어 낸다. "만들었습니다" -> "만들었" 처럼 어간으로 수렴시킨다. */
function normalizeToken(raw: string) {
  let token = raw;
  for (let pass = 0; pass < 3; pass += 1) {
    const stripped = stripSuffix(stripSuffix(token, VERB_TAILS), JOSA);
    if (stripped === token) break;
    token = stripped;
  }
  return token;
}

function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[가-힣a-z0-9]+/g) ?? [];
  const tokens: string[] = [];
  for (const word of raw) {
    const token = normalizeToken(word);
    if (token.length >= 2 && !STOP_WORDS.has(token)) tokens.push(token);
  }
  return tokens;
}

/** 한국어는 교착어라 낱말 경계가 흔들린다. 글자 2-gram이 그 흔들림을 흡수한다. */
function charBigrams(text: string): Set<string> {
  const clean = text.toLowerCase().replace(/[^가-힣a-z0-9]/g, "");
  const grams = new Set<string>();
  for (let index = 0; index + 1 < clean.length; index += 1) {
    grams.add(clean.slice(index, index + 2));
  }
  return grams;
}

type Weigher = (token: string) => number;

/** 흔한 낱말은 근거로서 값이 낮다. 문장을 문서로 보고 역문서빈도를 매긴다. */
function buildTokenWeights(documents: string[][]): Weigher {
  const documentFrequency = new Map<string, number>();
  for (const tokens of documents) {
    for (const token of new Set(tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const total = Math.max(1, documents.length);
  return (token: string) => {
    const frequency = documentFrequency.get(token) ?? 0;
    const idf = Math.log(1 + total / (1 + frequency));
    const lengthBonus = 1 + Math.min(token.length, 6) / 12;
    return Math.max(0.15, idf) * lengthBonus;
  };
}

/** 답변 문장의 내용이 자료에 얼마나 담겨 있는가(포함율). 재현율이 아니라 포함율이어야 길이에 흔들리지 않는다. */
function weightedContainment(source: Set<string>, target: Set<string>, weigh: Weigher) {
  let total = 0;
  let matched = 0;
  for (const token of source) {
    const weight = weigh(token);
    total += weight;
    if (target.has(token)) matched += weight;
  }
  return total > 0 ? matched / total : 0;
}

function plainContainment(source: Set<string>, target: Set<string>) {
  if (source.size === 0) return 0;
  let matched = 0;
  for (const gram of source) if (target.has(gram)) matched += 1;
  return matched / source.size;
}

type TextProfile = {
  text: string;
  tokens: string[];
  tokenSet: Set<string>;
  bigrams: Set<string>;
};

function profile(text: string): TextProfile {
  const tokens = tokenize(text);
  return { text, tokens, tokenSet: new Set(tokens), bigrams: charBigrams(text) };
}

function similarity(source: TextProfile, target: TextProfile, weigh: Weigher) {
  const byToken = weightedContainment(source.tokenSet, target.tokenSet, weigh);
  const byChar = plainContainment(source.bigrams, target.bigrams);
  return Math.min(1, byToken * 0.62 + byChar * 0.38);
}

function numbers(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?%?/g) ?? [];
}

/**
 * 참조 자료 색인.
 * 문장 하나, 인접 두 문장, 전체 본문을 후보로 둔다.
 * 한 주장이 두 문장에 걸쳐 설명되는 경우를 놓치지 않기 위해서다.
 */
type ReferenceIndex = {
  sentences: string[];
  candidates: TextProfile[];
  whole: TextProfile | null;
  numbers: string[];
};

function buildReferenceIndex(referenceText: string): ReferenceIndex {
  const sentences = splitSentences(referenceText);
  const singles = sentences.map(profile);
  const pairs: TextProfile[] = [];
  for (let index = 0; index + 1 < sentences.length; index += 1) {
    pairs.push(profile(`${sentences[index]} ${sentences[index + 1]}`));
  }
  return {
    sentences,
    candidates: [...singles, ...pairs],
    whole: sentences.length > 2 ? profile(referenceText) : null,
    numbers: numbers(referenceText),
  };
}

function sourceEvidence(sentence: TextProfile, index: ReferenceIndex, weigh: Weigher) {
  let bestIndex = -1;
  let bestScore = 0;
  for (let position = 0; position < index.candidates.length; position += 1) {
    const score = similarity(sentence, index.candidates[position], weigh);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = position;
    }
  }
  if (index.whole) {
    const wholeScore = similarity(sentence, index.whole, weigh) * WHOLE_DOCUMENT_DISCOUNT;
    if (wholeScore > bestScore) bestScore = wholeScore;
  }
  const bestProfile = bestIndex >= 0 ? index.candidates[bestIndex] : null;
  return {
    bestSentence: bestProfile?.text ?? "",
    bestProfile,
    bestScore,
    bestIsSingle: bestIndex >= 0 && bestIndex < index.sentences.length,
  };
}

/**
 * 두 문장이 같은 대상을 말하고 있는지 본다.
 * 충돌 판정에는 문장 전체 포함율이 아니라 이 값을 쓴다.
 * 답변이 자료에 없는 설명을 덧붙였다는 이유로 충돌 검사를 건너뛰면 안 되기 때문이다.
 */
function sharedContentCount(source: TextProfile, target: TextProfile | null) {
  if (!target) return 0;
  let shared = 0;
  for (const token of source.tokenSet) if (target.tokenSet.has(token)) shared += 1;
  return shared;
}

type NumberKind = "percent" | "year" | "decimal" | "count";

function numberKind(raw: string): NumberKind {
  if (raw.endsWith("%")) return "percent";
  if (raw.includes(".")) return "decimal";
  if (/^\d{4}$/.test(raw) && Number(raw) >= 1000 && Number(raw) <= 2999) return "year";
  return "count";
}

/**
 * 수치 충돌 판정.
 * "자료에 없는 숫자"가 아니라 "자료가 같은 종류의 값을 다르게 말하는 숫자"만 잡는다.
 * 답변이 자료에 없는 새 수치를 덧붙인 경우는 충돌이 아니라 근거 부족이다.
 */
function conflictingNumbers(sentence: string, evidence: string, index: ReferenceIndex) {
  if (!index.numbers.length) return [];
  const referenceNumbers = new Set(index.numbers);
  const evidenceKinds = new Set(numbers(evidence).map(numberKind));
  if (!evidenceKinds.size) return [];
  return numbers(sentence).filter(
    (value) => !referenceNumbers.has(value) && evidenceKinds.has(numberKind(value)),
  );
}

/**
 * 서술부만 잘라 낸다.
 * "…통하지 않아, …안타깝게 여겼다"처럼 앞 절의 부정이 문장 전체를 부정으로 만드는 오판을 막는다.
 */
function predicate(text: string) {
  const clause = text.split(/[,·;]/).pop() ?? text;
  return clause.trim();
}

/** 서술부의 부정 표현만 본다. "반대"·"감소" 같은 내용어는 부정이 아니라 방향이라 따로 다룬다. */
function hasNegation(text: string) {
  return /(지\s*않|지\s*못|없다|없습니다|없었|없는|없이|아니다|아닙니다|아니라|금지|불가)/.test(
    predicate(text),
  );
}

/** 방향이 정반대인 낱말쌍. 한쪽만 뒤집힌 경우를 의미 충돌로 본다. */
const DIRECTION_PAIRS: readonly (readonly [string, string])[] = [
  ["증가", "감소"],
  ["상승", "하락"],
  ["늘어", "줄어"],
  ["확대", "축소"],
  ["개선", "악화"],
  ["찬성", "반대"],
  ["허용", "금지"],
];

function directionConflict(sentence: string, evidence: string) {
  return DIRECTION_PAIRS.some(
    ([up, down]) =>
      (sentence.includes(up) && evidence.includes(down)) ||
      (sentence.includes(down) && evidence.includes(up)),
  );
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

/** 서로 다른 낱말쌍의 비율(distinct-2). 붕괴 실험에서 쓰는 표현 다양성 지표와 같은 정의다. */
function distinctBigramRatio(tokenLists: string[][]) {
  const pairs: string[] = [];
  for (const tokens of tokenLists) {
    for (let index = 0; index + 1 < tokens.length; index += 1) {
      pairs.push(`${tokens[index]} ${tokens[index + 1]}`);
    }
  }
  if (pairs.length < 2) return 1;
  return new Set(pairs).size / pairs.length;
}

/** 앞 문장과 내용이 70% 이상 겹치는 문장의 비율. 어미 반복은 한국어에서 자연스러우므로 세지 않는다. */
function duplicateSentenceRatio(tokenLists: string[][]) {
  const meaningful = tokenLists.filter((tokens) => tokens.length >= 2);
  if (meaningful.length < 2) return 0;
  let duplicates = 0;
  const seen: Set<string>[] = [];
  for (const tokens of meaningful) {
    const current = new Set(tokens);
    if (seen.some((earlier) => plainContainment(current, earlier) >= 0.7)) duplicates += 1;
    seen.push(current);
  }
  return ratio(duplicates, meaningful.length);
}

function koreanQualityScore(answer: string, sentences: string[]) {
  const letters = answer.match(/[가-힣a-zA-Z]/g) ?? [];
  const english = answer.match(/[a-zA-Z]/g) ?? [];
  const englishRatio = ratio(english.length, letters.length);
  const translationeseCount = TRANSLATIONESE.filter(([phrase]) => answer.includes(phrase)).length;
  const longSentenceRatio = ratio(
    sentences.filter((sentence) => sentence.length > 120).length,
    sentences.length,
  );
  const spacingRatio = ratio((answer.match(/\s{2,}/g) ?? []).length, sentences.length);
  return clamp(
    96 -
      englishRatio * 150 -
      translationeseCount * 7 -
      longSentenceRatio * 26 -
      Math.min(12, spacingRatio * 12),
  );
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
  // 마크다운 기호를 먼저 걷어 낸다. 제목·표·강조 표기가 남으면 문장 분리부터 무너진다.
  const answerText = normalizeMarkdown(input.answer);
  const answerSentences = splitSentences(answerText);
  const index = buildReferenceIndex(normalizeMarkdown(input.referenceText));
  const hasReference = index.sentences.length > 0;
  const invalidSource = !validSourceUrl(input.sourceUrl);
  const fatalErrors: string[] = [];

  if (invalidSource) fatalErrors.push("출처 링크 형식이 올바르지 않습니다.");

  const answerProfiles = answerSentences.map(profile);
  const weigh = buildTokenWeights([
    ...answerProfiles.map((item) => item.tokens),
    ...index.candidates.map((item) => item.tokens),
  ]);

  let contradictionCount = 0;
  let unsupportedCount = 0;
  let claimCount = 0;
  let absoluteCount = 0;
  const usedEvidenceProfiles = new Set<TextProfile>();

  const findings: Finding[] = answerProfiles.map((current, position) => {
    const sentence = current.text;
    const id = position + 1;
    const { bestSentence, bestProfile, bestScore, bestIsSingle } = hasReference
      ? sourceEvidence(current, index, weigh)
      : { bestSentence: "", bestProfile: null, bestScore: 0, bestIsSingle: false };
    const evidenceScore = clamp(bestScore * 100);
    const isClaim = current.tokens.length >= MIN_CLAIM_TOKENS;
    if (isClaim) claimCount += 1;
    if (bestProfile && bestScore >= SUPPORTED_THRESHOLD) usedEvidenceProfiles.add(bestProfile);

    const absolute = ABSOLUTE_PHRASES.find((phrase) => sentence.includes(phrase));
    if (absolute) absoluteCount += 1;
    const translationese = TRANSLATIONESE.find(([phrase]) => sentence.includes(phrase));

    const sameTopic =
      hasReference && sharedContentCount(current, bestProfile) >= CONFLICT_SHARED_TOKENS;
    const numberConflicts = sameTopic ? conflictingNumbers(sentence, bestSentence, index) : [];
    // 부정·방향 충돌은 근거가 참조 문장 하나로 특정될 때만 본다.
    // 여러 문장을 묶은 근거에서는 어느 절의 부정인지 알 수 없어 오탐이 난다.
    const polarityConflict =
      sameTopic &&
      bestIsSingle &&
      (hasNegation(sentence) !== hasNegation(bestSentence) ||
        directionConflict(sentence, bestSentence));

    if (numberConflicts.length > 0 || polarityConflict) {
      contradictionCount += 1;
      return {
        id,
        sentence,
        level: "critical" as const,
        label: numberConflicts.length > 0 ? "수치 불일치" : "의미 충돌",
        issue:
          numberConflicts.length > 0
            ? `자료는 같은 항목을 다른 값으로 적고 있습니다. 답변의 ${numberConflicts.join(", ")}을(를) 다시 확인하세요.`
            : "답변과 사람이 쓴 자료가 서로 반대되는 말을 하고 있습니다.",
        evidence: bestSentence || "사람이 쓴 자료에서 맞대 볼 문장을 찾지 못했습니다.",
        suggestion: bestSentence || softenAbsolute(sentence),
        evidenceScore,
      };
    }

    if (isClaim && (!hasReference || bestScore < SUPPORTED_THRESHOLD)) {
      unsupportedCount += 1;
      return {
        id,
        sentence,
        level: "warning" as const,
        label: "근거 부족",
        issue: hasReference
          ? "이 말을 뒷받침하는 내용을 사람이 쓴 자료에서 충분히 찾지 못했습니다."
          : "맞대 볼 사람 작성 자료를 넣지 않았습니다.",
        evidence: bestSentence || "연결된 근거 없음",
        suggestion: bestSentence || `${softenAbsolute(sentence)} (출처 확인 필요)`,
        evidenceScore,
      };
    }

    if (absolute || translationese) {
      return {
        id,
        sentence,
        level: "style" as const,
        label: absolute ? "과도한 단정" : "번역투 표현",
        issue: absolute
          ? `“${absolute}”처럼 예외를 지우는 표현은 출처보다 센 주장으로 읽힐 수 있습니다.`
          : "한국어에서 더 짧고 자연스럽게 쓸 수 있는 표현입니다.",
        evidence: bestSentence,
        suggestion: translationese
          ? sentence.replace(translationese[0], translationese[1])
          : softenAbsolute(sentence),
        evidenceScore,
      };
    }

    return {
      id,
      sentence,
      level: "good" as const,
      label: isClaim ? "근거 확인" : "연결 문장",
      issue: isClaim
        ? "사람이 쓴 자료와 내용이 대체로 맞습니다."
        : "사실을 주장하는 문장이 아니어서 근거 대조 대상에서 제외했습니다.",
      evidence: bestSentence,
      suggestion: sentence,
      evidenceScore,
    };
  });

  if (contradictionCount > 0) {
    fatalErrors.push(`자료와 어긋나는 핵심 내용이 ${contradictionCount}곳 있습니다.`);
  }

  // 아래 감점은 모두 비율이다. 같은 품질이면 3문장이든 30문장이든 같은 점수가 나와야 한다.
  const unsupportedRatio = ratio(unsupportedCount, claimCount);
  const contradictionRatio = ratio(contradictionCount, claimCount);
  const absoluteRatio = ratio(absoluteCount, answerSentences.length);

  // 근거성은 사실 주장 문장만, 그리고 문장 길이로 가중해서 평균 낸다.
  let groundingWeightTotal = 0;
  let groundingWeightedSum = 0;
  findings.forEach((finding, position) => {
    const tokens = answerProfiles[position].tokens.length;
    if (tokens < MIN_CLAIM_TOKENS) return;
    const weight = Math.min(40, tokens);
    groundingWeightTotal += weight;
    groundingWeightedSum += finding.evidenceScore * weight;
  });
  const evidenceAverage = ratio(groundingWeightedSum, groundingWeightTotal);

  const answerTokenSet = new Set(answerProfiles.flatMap((item) => item.tokens));
  // 정보 보존은 자료 전체가 아니라 "답변이 실제로 근거로 삼은 부분"을 얼마나 살렸는지로 잰다.
  // 자료 전체를 기준으로 하면 짧은 답변이 길다는 이유만으로 손해를 본다.
  const evidenceTokenSet = new Set<string>();
  for (const profileUsed of usedEvidenceProfiles) {
    for (const token of profileUsed.tokenSet) evidenceTokenSet.add(token);
  }
  const referenceCoverage = weightedContainment(evidenceTokenSet, answerTokenSet, weigh);
  const answerTokenLists = answerProfiles.map((item) => item.tokens);

  const metrics: Record<MetricKey, number> = {
    grounding: hasReference ? clamp(evidenceAverage) : 0,
    accuracy: clamp(96 - contradictionRatio * 60 - unsupportedRatio * 30),
    koreanQuality: koreanQualityScore(answerText, answerSentences),
    // 자연스러운 한국어는 distinct-2가 0.9 위에 몰려 있다. 0.55~1.0 구간을 0~100으로 펴서 변별력을 준다.
    diversity: clamp(
      ((distinctBigramRatio(answerTokenLists) - 0.55) / 0.45) * 100 -
        duplicateSentenceRatio(answerTokenLists) * 45,
    ),
    information: hasReference ? clamp(referenceCoverage * 115) : 0,
    transparency: clamp(94 - unsupportedRatio * 40 - Math.min(24, absoluteRatio * 24)),
  };

  const scoredMetrics = (Object.keys(METRIC_WEIGHTS) as MetricKey[]).filter(
    (key) => hasReference || !SOURCE_DEPENDENT_METRICS.includes(key),
  );
  const weightSum = scoredMetrics.reduce((sum, key) => sum + METRIC_WEIGHTS[key], 0);
  const weightedScore = clamp(
    scoredMetrics.reduce((sum, key) => sum + metrics[key] * METRIC_WEIGHTS[key], 0) / weightSum,
  );

  let verdict: Verdict;
  let score: number | null = weightedScore;
  if (fatalErrors.length > 0) {
    verdict = "사용 비추천";
    score = null;
  } else if (!hasReference || unsupportedRatio > UNSUPPORTED_VERDICT_RATIO) {
    verdict = "근거 추가 필요";
  } else if (weightedScore >= 82 && scoredMetrics.every((key) => metrics[key] >= 65)) {
    verdict = "사용 가능";
  } else {
    verdict = "수정 후 사용";
  }

  const summary = fatalErrors.length
    ? `${fatalErrors[0]} 꼭 고쳐야 할 오류라서 세부 점수보다 먼저 알려 드립니다.`
    : unsupportedCount > 0
      ? `사실 주장 ${claimCount}개 중 ${unsupportedCount}개에 연결할 근거가 부족합니다.`
      : verdict === "사용 가능"
        ? "꼭 고쳐야 할 오류가 없고, 주요 내용이 사람이 쓴 자료와 대체로 맞습니다."
        : "꼭 고쳐야 할 오류는 없지만 표현과 빠진 내용을 다듬어야 합니다.";

  const revisedAnswer = findings
    .map((finding) => finding.suggestion)
    .filter(Boolean)
    .filter((sentence, position, array) => array.indexOf(sentence) === position)
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
