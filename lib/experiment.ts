/**
 * 붕괴 실험실 데이터.
 *
 * 아래 `RAW_RUNS`는 데모 값이 아니라 실제 실험에서 나온 측정값이다.
 * 출처: https://github.com/sji09/recursive-collapse-ko
 *   - 지표 원본: collapse_runs/{E1,E2,C1}_metrics.json
 *   - 결과 보고서: RECURSIVE_COLLAPSE_RESULTS.md
 *   - 생성 문장 샘플: collapse_samples.txt
 *
 * 설정 요약: 35M 파라미터 GPT(8층, d=512, ctx 512), ByteLevel BPE 16k,
 * Gen-0 = 위키피디아 EN 90MB + KO 10MB, 세대마다 합성 15M 토큰으로 전체 재학습("replace") × 8세대.
 */

export type LabLanguage = "ko" | "en";
export type RunId = "e1" | "e2" | "c1";

export type RawGeneration = {
  pplEn: number;
  pplKo: number;
  distinct2En: number;
  distinct2Ko: number;
  /** 한국어 프롬프트에 대해 생성된 글자 중 한글이 차지한 비율 */
  hangulKo: number;
};

export type LabPoint = {
  generation: number;
  /** 0~100. 100 - 붕괴도. 계산식은 TRUST_SCALE_DECADES 주석 참고 */
  trust: number;
  /** 0~100. 100 - 신뢰도 */
  collapse: number;
  /** distinct-2(2-gram 다양성)를 백분율로 바꾼 값 */
  diversity: number;
  /** 원본 세대 대비 퍼플렉시티 배수 */
  pplRatio: number;
  /** 원본 세대의 한글 응답 비율을 100으로 둔 상대값 (한국어에서만 의미 있음) */
  hangulRetention: number;
  /** 실제 측정된 한글 응답 비율(%) */
  hangulRatio: number;
};

export type RunMeta = {
  id: RunId;
  /** 실험 코드 (E1 / E2 / C1) */
  code: string;
  /** 비전문가용 짧은 이름 */
  label: string;
  /** 무엇을 먹여서 다시 학습시켰는지 한 줄 설명 */
  feed: string;
  /** 이 실험이 답하려는 질문 */
  question: string;
  tone: "danger" | "warn" | "safe";
};

export const RUNS: RunMeta[] = [
  {
    id: "e1",
    code: "E1",
    label: "AI가 쓴 글로 반복",
    feed: "AI가 만들어 낸 글(한국어 10% 포함)만 먹여서 다시 학습",
    question: "AI가 자기 글만 다시 배우면, 한국어가 영어보다 빨리 무너질까?",
    tone: "danger",
  },
  {
    id: "e2",
    code: "E2",
    label: "영어 글로만 반복",
    feed: "AI가 만들어 낸 영어 글만 먹여서 다시 학습 (한국어는 아예 안 먹임)",
    question: "한국어를 아예 안 먹였는데도 한국어 실력이 떨어질까?",
    tone: "warn",
  },
  {
    id: "c1",
    code: "C1",
    label: "사람이 쓴 글로 반복",
    feed: "매번 사람이 쓴 원래 자료를 먹여서 다시 학습 (비교용 대조군)",
    question: "그냥 여러 번 다시 학습해서 나빠진 건 아닐까?",
    tone: "safe",
  },
];

/**
 * 신뢰도 정규화 기준.
 * 퍼플렉시티(PPL)는 자릿수 단위로 커지므로 log10 증가폭으로 다룬다.
 * 실험 전체에서 관측된 최대 악화폭이 약 8.96 자릿수(E2 한국어)였기 때문에
 * "원본보다 9 자릿수 나빠지면 신뢰도 0"을 기준으로 삼는다.
 */
export const TRUST_SCALE_DECADES = 9;

const RAW_RUNS: Record<RunId, RawGeneration[]> = {
  e1: [
    { pplEn: 3942.0482361356776, pplKo: 15419.22116295666, distinct2En: 0.9111430822457438, distinct2Ko: 0.983034454966754, hangulKo: 0.12015180462581837 },
    { pplEn: 46011.24750007014, pplKo: 755688.3158257548, distinct2En: 0.9129040394940723, distinct2Ko: 0.9581873658040456, hangulKo: 0.058959292228471384 },
    { pplEn: 321265.1173088947, pplKo: 16470244.983909383, distinct2En: 0.8992553657468244, distinct2Ko: 0.9200254243625215, hangulKo: 0.04636221478362778 },
    { pplEn: 1294475.6389600642, pplKo: 118764098.80348444, distinct2En: 0.8827476275207592, distinct2Ko: 0.8828189223525895, hangulKo: 0.037681536119943064 },
    { pplEn: 6534417.962004893, pplKo: 1648015628.7449994, distinct2En: 0.855667372881356, distinct2Ko: 0.8585264744676842, hangulKo: 0.03355043330465098 },
    { pplEn: 13571982.877774801, pplKo: 4146322725.6124997, distinct2En: 0.8228240882623353, distinct2Ko: 0.8260482403499942, hangulKo: 0.026126327206849407 },
    { pplEn: 30533221.964913357, pplKo: 45216516554.26352, distinct2En: 0.7830147783251231, distinct2Ko: 0.7849326930646304, hangulKo: 0.020831561151493313 },
    { pplEn: 230204623.8856057, pplKo: 593802633158.1084, distinct2En: 0.7451406544738784, distinct2Ko: 0.7433917555255954, hangulKo: 0.014380153089736019 },
    { pplEn: 798030025.5058503, pplKo: 3145313965830.6245, distinct2En: 0.7055953584457826, distinct2Ko: 0.7081331197722015, hangulKo: 0.009677153862906551 },
  ],
  e2: [
    { pplEn: 4502.173183266846, pplKo: 17300.03707465203, distinct2En: 0.9120603015075377, distinct2Ko: 0.9852637662016016, hangulKo: 0.13043898742988702 },
    { pplEn: 57999.650504496654, pplKo: 1644531.7344566793, distinct2En: 0.9084039548022599, distinct2Ko: 0.913936761145136, hangulKo: 0.038937735750061014 },
    { pplEn: 298434.9855264435, pplKo: 18355924.355761528, distinct2En: 0.8888413547237076, distinct2Ko: 0.890856406954282, hangulKo: 0.03428814479147818 },
    { pplEn: 1502080.0251074475, pplKo: 189956519.4722641, distinct2En: 0.8670387393302692, distinct2Ko: 0.8661697873113979, hangulKo: 0.026642130623343724 },
    { pplEn: 5063076.681993973, pplKo: 2276117087.4733176, distinct2En: 0.8311989842191184, distinct2Ko: 0.8355119030232219, hangulKo: 0.02193192336890812 },
    { pplEn: 11484510.517087432, pplKo: 5363734103.843103, distinct2En: 0.8018451961910408, distinct2Ko: 0.7978059321094818, hangulKo: 0.015769574609241638 },
    { pplEn: 32954765.101301763, pplKo: 122978573670.3216, distinct2En: 0.760913515537252, distinct2Ko: 0.7586736030540066, hangulKo: 0.009860244375401542 },
    { pplEn: 205108158.6514139, pplKo: 893508505410.89, distinct2En: 0.7161062906724512, distinct2Ko: 0.7168217054263566, hangulKo: 0.005841678380123156 },
    { pplEn: 757916789.4978571, pplKo: 15604351515603.469, distinct2En: 0.6707968901846453, distinct2Ko: 0.6632084918886441, hangulKo: 0.0026386027757104753 },
  ],
  c1: [
    { pplEn: 4200.327736822377, pplKo: 16193.127557817457, distinct2En: 0.9062755519215046, distinct2Ko: 0.979253112033195, hangulKo: 0.1213138715325791 },
    { pplEn: 4342.54598439237, pplKo: 18387.725716265522, distinct2En: 0.911209002994115, distinct2Ko: 0.9794089533216505, hangulKo: 0.1302930369304026 },
    { pplEn: 4238.506353792855, pplKo: 18471.29850051476, distinct2En: 0.9135112766397683, distinct2Ko: 0.9844656256337457, hangulKo: 0.1343811357595583 },
    { pplEn: 4413.574985209671, pplKo: 19075.434620281372, distinct2En: 0.9169746157831117, distinct2Ko: 0.9796600724435776, hangulKo: 0.11265033328053999 },
    { pplEn: 4373.395046573454, pplKo: 20706.30731887492, distinct2En: 0.9119384530842148, distinct2Ko: 0.974867299340518, hangulKo: 0.13281125983780298 },
    { pplEn: 4080.5922915959104, pplKo: 20855.607981252342, distinct2En: 0.9143083384975556, distinct2Ko: 0.9801218339211286, hangulKo: 0.12270447220484186 },
    { pplEn: 3733.5553482467453, pplKo: 24700.59212252931, distinct2En: 0.9097829441415493, distinct2Ko: 0.9784520668425681, hangulKo: 0.11976535648858266 },
    { pplEn: 4309.122069551145, pplKo: 19411.044532407715, distinct2En: 0.9138764179718291, distinct2Ko: 0.9833976987697576, hangulKo: 0.11747453951217506 },
    { pplEn: 4588.347438467106, pplKo: 22034.412956050674, distinct2En: 0.9083179044092436, distinct2Ko: 0.9841165606402626, hangulKo: 0.1257504957371012 },
  ],
};

export const MAX_GENERATION = RAW_RUNS.e1.length - 1;

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function buildSeries(run: RunId, language: LabLanguage): LabPoint[] {
  const raw = RAW_RUNS[run];
  const base = raw[0];
  const basePpl = language === "ko" ? base.pplKo : base.pplEn;

  return raw.map((row, generation) => {
    const ppl = language === "ko" ? row.pplKo : row.pplEn;
    const decades = Math.log10(ppl / basePpl);
    const trust = Math.round(clamp(100 * (1 - decades / TRUST_SCALE_DECADES)));
    const distinct2 = language === "ko" ? row.distinct2Ko : row.distinct2En;

    return {
      generation,
      trust,
      collapse: 100 - trust,
      diversity: Math.round(distinct2 * 100),
      pplRatio: ppl / basePpl,
      hangulRetention: Math.round(clamp((row.hangulKo / base.hangulKo) * 100)),
      hangulRatio: Number((row.hangulKo * 100).toFixed(1)),
    };
  });
}

const SERIES_CACHE = new Map<string, LabPoint[]>();

export function getLabSeries(run: RunId, language: LabLanguage): LabPoint[] {
  const key = `${run}:${language}`;
  const cached = SERIES_CACHE.get(key);
  if (cached) return cached;
  const built = buildSeries(run, language);
  SERIES_CACHE.set(key, built);
  return built;
}

/**
 * 실제로 모델이 만들어 낸 문장 조각.
 * collapse_samples.txt에서 각 세대 앞부분을 그대로 잘라 왔다.
 * E1은 한국어 프롬프트에 대한 생성분, E2는 영어 프롬프트에 대한 생성분이다.
 * C1(사람이 쓴 글로 반복)은 세대별 샘플이 공개되어 있지 않다.
 */
const SAMPLES: Partial<Record<RunId, Record<number, string>>> = {
  e1: {
    1: "ATP list으로 particularlyified scientists 1947년 4월 19일 g.field년 1일였다. 《ope J fl우 sil designney동opes 12월 1일uff 1일 : West at 1일 : 안 fact 1966년 5월 12월 25일",
    2: ", L aircraftie P Prince.ac has beenner어 이란 PAM압, and on their) tseringen T individual into theised on3일,이is, stability ande, and on the S, her use out that light marker without bass인은ol 널리align is년",
    4: "antcy sinceine onanors, and체ing les In10 moreet form of M view used as her three- N by South of the1, and at arowation, since월. was in4–p. have toata,ats andist 8- the 차iot체",
    6: "called withland andé 염 unash.is period inD dis by the were- 있는The of –ées. L Von twoe),honon, he other he-. et is also and pFSin and2 D M her in its in the mon.",
    8: "L the \"et in\" ofc by's–' not The somean,S. TheN b on the CastThe two LC andian 제N with a firsting to, the 24 it is ( The 평 of theb P,Htit, He has been American 있다.",
  },
  e2: {
    1: ", Lifeicateel,일 san acet, and whom he had no – nucleights, and every 1980s with one of Sump Wednesday도 and it wasidency U. Fierk ( amDsted synt when 기계ing,ation of industry",
    2: "-s search and aS). sur and the Parliament,ate high in an Prime리 of Marchus seen by the capital returned,a These ( Con Con F m can be a 1landHistory of stability with le's Worldy International",
    4: "theideats andfare such as a병 out of the May Be be드centurycenturyi Army was orE Cations, off one of수 of theord Am ( it are군 as ail aircraft,R new토reus as well as aate she which the musicians",
    6: "the (thele was In not film of - t man8ists. S was9. was a toingS used to over their 2 In his W thead andan Ining ( d on in thee.c on the",
    8: "a55 in: The world,an but the butineate, P from \" The it. In thead season. and years. Thisable, and 1. M- K. and 시. L only has been W has.",
  },
};

export function getSample(run: RunId, generation: number): string | null {
  return SAMPLES[run]?.[generation] ?? null;
}

/** 요청한 세대 이하에서 샘플이 있는 가장 가까운 세대. 없으면 null */
export function nearestSampleGeneration(run: RunId, generation: number): number | null {
  const table = SAMPLES[run];
  if (!table) return null;
  const eligible = Object.keys(table)
    .map(Number)
    .filter((value) => value <= generation)
    .sort((a, b) => a - b);
  return eligible.length ? eligible[eligible.length - 1] : null;
}

/**
 * 전달 게임 비유용 예시 문장.
 * 실험 측정값이 아니라, 개념을 설명하려고 사람이 직접 쓴 예시다.
 */
export const RELAY_CHAIN = [
  { step: 0, who: "처음 사람", text: "훈민정음은 1443년에 만들어져 1446년에 널리 알려졌어요." },
  { step: 1, who: "두 번째 사람", text: "훈민정음은 1443년에 만들어져서 곧바로 알려졌대요." },
  { step: 2, who: "세 번째 사람", text: "훈민정음은 1443년쯤 만들어지고 바로 다 쓰기 시작했대요." },
  { step: 3, who: "네 번째 사람", text: "훈민정음이 나오자마자 모두가 썼다던데요." },
  { step: 4, who: "마지막 사람", text: "옛날에 글자가 생겨서 다 같이 썼대요." },
] as const;
