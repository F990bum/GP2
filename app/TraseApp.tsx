"use client";

import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  analyzeAnswer,
  type AnalysisResult,
  type CheckInput,
  METRIC_LABELS,
  type MetricKey,
} from "../lib/analyzer";
import {
  getLabSeries,
  getSample,
  type LabLanguage,
  type LabPoint,
  MAX_GENERATION,
  nearestSampleGeneration,
  RELAY_CHAIN,
  type RunId,
  RUNS,
} from "../lib/experiment";

const SAMPLE: CheckInput = {
  question: "세종대왕은 왜 훈민정음을 만들었나요? 중학생 수준으로 설명해 줘.",
  answer:
    "세종대왕은 모든 백성이 한자를 완전히 금지하고 오직 훈민정음만 쓰게 하려고 훈민정음을 만들었습니다. 훈민정음은 1445년에 창제되었으며, 반포 직후 모든 국민이 즉시 사용했습니다. 이러한 정책 덕분에 문맹률은 단숨에 0%가 되었습니다.",
  referenceText:
    "세종은 우리나라 말이 중국과 달라 한자와 서로 통하지 않아, 글을 모르는 백성이 뜻을 펴기 어려운 것을 안타깝게 여겼다. 이에 누구나 쉽게 익혀 날마다 편리하게 쓰도록 새 문자 훈민정음을 만들었다. 훈민정음은 1443년에 창제되고 1446년에 반포되었다.",
  sourceUrl: "https://encykorea.aks.ac.kr/Article/E0061774",
  purpose: "수행평가",
};

const PURPOSES = ["수행평가", "정보 조사", "발표", "일반 글쓰기"];
const METRIC_KEYS = Object.keys(METRIC_LABELS) as MetricKey[];

const RESEARCH_REPO = "https://github.com/sji09/recursive-collapse-ko";
const RESEARCH_RESULTS = "https://github.com/sji09/recursive-collapse-ko/blob/main/RECURSIVE_COLLAPSE_RESULTS.md";

/** 신뢰도 점수를 한 줄 안내 문장으로 바꾼다. */
function trustWording(score: number) {
  if (score >= 82) return "지금 내용 그대로 써도 큰 문제는 보이지 않습니다.";
  if (score >= 65) return "몇 군데만 고치면 쓸 수 있습니다. 아래 문장을 확인해 주세요.";
  if (score >= 45) return "고쳐야 할 곳이 여러 군데입니다. 그대로 제출하지 마세요.";
  return "믿고 쓰기 어렵습니다. 사람이 쓴 자료로 다시 확인해야 합니다.";
}

/** 기준 자료 없이 검사했을 때의 안내. 점수가 "사실 확인 결과"로 읽히지 않도록 말을 바꾼다. */
function unverifiedWording(score: number) {
  if (score >= 80) return "글 자체는 무리 없어 보입니다. 다만 내용이 사실인지는 확인하지 못했습니다.";
  if (score >= 60) return "글 형태는 괜찮지만 다듬을 곳이 있습니다. 내용이 사실인지는 확인하지 못했습니다.";
  return "표현부터 다듬는 편이 좋겠습니다. 내용이 사실인지도 확인하지 못했습니다.";
}

function safeLink(value?: string) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

const KOREAN_UNITS = [
  { base: 1e12, suffix: "조" },
  { base: 1e8, suffix: "억" },
  { base: 1e4, suffix: "만" },
];

/** 자릿수가 큰 배수를 "약 2.0억 배"처럼 읽기 쉬운 한국어 단위로 바꾼다. */
function formatMultiplier(ratio: number) {
  if (ratio < 10) return `${ratio.toFixed(1)}배`;
  if (ratio < 1e4) return `${Math.round(ratio).toLocaleString("ko-KR")}배`;
  const unit = KOREAN_UNITS.find((item) => ratio >= item.base);
  if (!unit) return `${Math.round(ratio).toLocaleString("ko-KR")}배`;
  const value = ratio / unit.base;
  const shown = value >= 10 ? Math.round(value).toLocaleString("ko-KR") : value.toFixed(1);
  return `약 ${shown}${unit.suffix} 배`;
}

function TrustRing({ value, tone, caption }: { value: number | null; tone: string; caption: string }) {
  return (
    <div className={`trust-ring tone-${tone}`} style={{ "--ring-value": `${value ?? 0}` } as CSSProperties}>
      <div className="trust-ring-face">
        <b>{value ?? "!"}</b>
        <small>{value === null ? "보류" : "점"}</small>
      </div>
      <span>{caption}</span>
    </div>
  );
}

function TrendBars({ series, active, onSelect }: { series: LabPoint[]; active: number; onSelect: (generation: number) => void }) {
  return (
    <div className="trend-bars" role="group" aria-label="반복 횟수에 따른 신뢰도 그래프">
      <div className="chart-grid" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="bar-columns">
        {series.map((point) => (
          <button
            type="button"
            className={point.generation === active ? "bar-column active" : "bar-column"}
            key={point.generation}
            style={{ "--bar-height": `${Math.max(point.trust, 2)}%` } as CSSProperties}
            aria-label={`${point.generation}번 반복 (G${point.generation} 세대) · 신뢰도 ${point.trust}점`}
            aria-pressed={point.generation === active}
            onClick={() => onSelect(point.generation)}
          >
            <i><b /></i><span>{point.generation}번</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TraseApp() {
  const [input, setInput] = useState<CheckInput>(SAMPLE);
  const [result, setResult] = useState<AnalysisResult>(() => analyzeAnswer(SAMPLE));
  const [checkedInput, setCheckedInput] = useState<CheckInput>(SAMPLE);
  const [tab, setTab] = useState<"sentences" | "source" | "revision">("sentences");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [formError, setFormError] = useState("");
  const [copied, setCopied] = useState(false);
  const [approved, setApproved] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [usingSample, setUsingSample] = useState(true);
  const [language, setLanguage] = useState<LabLanguage>("ko");
  const [run, setRun] = useState<RunId>("e1");
  const [generation, setGeneration] = useState(MAX_GENERATION);

  const series = useMemo(() => getLabSeries(run, language), [run, language]);
  const labPoint = series[generation];
  const firstPoint = series[0];
  const finalPoint = series[series.length - 1];
  const runMeta = RUNS.find((item) => item.id === run) ?? RUNS[0];
  const sampleGeneration = nearestSampleGeneration(run, generation);
  const sampleText = sampleGeneration === null ? null : getSample(run, sampleGeneration);
  const sourceHref = safeLink(checkedInput.sourceUrl);
  const fatalCount = result.fatalErrors.length;
  const issueCount = result.findings.filter((finding) => finding.level !== "good").length;
  const verdictTone = result.verdict === "사용 가능" ? "safe" : result.verdict === "사용 비추천" ? "danger" : "warn";
  const missingAnchor = !checkedInput.referenceText.trim();
  const trustCaption =
    result.score === null
      ? `꼭 고쳐야 할 오류 ${fatalCount}개 — 점수보다 먼저 고쳐야 합니다`
      : missingAnchor
        ? unverifiedWording(result.score)
        : trustWording(result.score);

  /**
   * 예시가 올라와 있는 상태에서 사용자가 질문이나 답변을 자기 것으로 바꾸면
   * 접혀 있던 고급 설정의 예시 기준 자료도 함께 비운다.
   * 그러지 않으면 보이지도 않는 남의 자료와 대조되어 점수가 엉뚱하게 나온다.
   */
  const update = (key: keyof CheckInput, value: string) => {
    const replacingSample = usingSample && (key === "question" || key === "answer");
    setInput((current) => ({
      ...current,
      [key]: value,
      ...(replacingSample ? { referenceText: "", sourceUrl: "" } : null),
    }));
    if (replacingSample || key === "referenceText" || key === "sourceUrl") setUsingSample(false);
    setApproved(false);
  };

  const runCheck = (event?: FormEvent) => {
    event?.preventDefault();
    if (!input.answer.trim()) {
      setFormError("검사할 AI 답변을 붙여 넣어 주세요.");
      return;
    }
    setFormError("");
    setIsAnalyzing(true);
    setApproved(false);
    const snapshot = input;
    window.setTimeout(() => {
      setResult(analyzeAnswer(snapshot));
      setCheckedInput(snapshot);
      setIsAnalyzing(false);
      setTab("sentences");
    }, 520);
  };

  const loadExample = () => {
    setUsingSample(true);
    setInput(SAMPLE);
    setResult(analyzeAnswer(SAMPLE));
    setCheckedInput(SAMPLE);
    setTab("sentences");
    setApproved(false);
    setFormError("");
  };

  const copyRevision = async () => {
    await navigator.clipboard.writeText(result.revisedAnswer);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <a className="skip-link" href="#main-content">본문 바로가기</a>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="TRASE 홈">
          <span className="brand-mark" aria-hidden="true">T</span>
          <span className="brand-lockup"><strong>TRASE</strong><small>AI 답변 신뢰도 검사</small></span>
        </a>
        <nav aria-label="주요 메뉴">
          <a href="#relay">전달 게임</a>
          <a href="#lab">붕괴 실험</a>
          <a href="#inspect">신뢰도 검사</a>
          <a href="#research">연구 내용</a>
        </nav>
        <a className="header-cta" href="#inspect">내 답변 검사하기</a>
      </header>

      <main id="main-content">
      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-dot" aria-hidden="true" />
            <span className="eyebrow-copy"><b>TRASE</b> · AI 답변 신뢰도 검사</span>
          </p>
          <h1>말은 옮길수록 <em>변합니다</em>.<br className="desktop-break" />{" "}AI도 똑같습니다.</h1>
          <p className="hero-lede">
            여러 사람이 줄을 서서 앞사람의 말을 뒤로 전하는 <b>전달 게임</b>을 해 본 적 있나요?
            한 사람만 건너도 말이 조금씩 바뀌고, 몇 번만 지나면 처음 이야기와 전혀 달라집니다.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#lab">AI가 무너지는 모습 보기 <span>↗</span></a>
            <a className="text-link" href="#inspect">바로 내 답변 검사하기 <span>→</span></a>
          </div>
          <p className="hero-note"><span>✓</span> 검사는 브라우저 안에서만 이루어지고, 입력한 글은 어디에도 저장하지 않습니다.</p>
        </div>

        <div className="relay-card" id="relay">
          <div className="relay-head">
            <span>전달 게임</span>
            <strong>사람 5명만 거쳐도</strong>
          </div>
          <ol className="relay-chain">
            {RELAY_CHAIN.map((link) => (
              <li key={link.step} className={link.step === 0 ? "is-origin" : link.step === RELAY_CHAIN.length - 1 ? "is-last" : ""}>
                <b aria-hidden="true">{link.step + 1}</b>
                <div>
                  <span>{link.who}</span>
                  <p>{link.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="relay-flags">
            <span>연도가 사라짐</span><span>내용이 뭉뚱그려짐</span><span>없던 말이 생김</span>
          </div>
          <p className="demo-caption">개념을 설명하기 위한 예시 문장입니다. 실제 실험 수치는 아래 붕괴 실험에서 공개합니다.</p>
        </div>
      </section>

      <section className="bridge-section" aria-labelledby="bridge-title">
        <div className="section-kicker"><span>사람 → 인공지능</span><i /></div>
        <div className="bridge-copy">
          <h2 id="bridge-title">여기서 &lsquo;사람&rsquo; 대신 <em>인공지능</em>이 온다면 어떨까요?</h2>
          <p>
            ChatGPT 같은 AI에게도 똑같은 일이 일어납니다.
            AI가 만든 글이 인터넷에 빠르게 늘어나면서, AI가 배울 <b>사람이 쓴 글</b>은 상대적으로 부족해지고 있습니다.
            그래서 AI가 <b>자기(혹은 다른 AI)가 만든 글을 다시 배우는</b> 일이 생깁니다. 이것을 <b>재귀 학습</b>이라고 부릅니다.
          </p>
          <p>
            전달 게임에서 사람이 늘어날수록 이야기가 망가지듯, 재귀 학습을 반복할수록 AI의 답변도 뭉뚱그려지고 틀린 내용이 쌓입니다.
            그러면 자연스럽게 질문이 하나 생깁니다.
          </p>
          <p className="bridge-question">
            영어에 비해 자료가 적은 <b>한국어</b>는, 이 과정에서 <b>더 빨리 무너지지 않을까?</b>
          </p>
          <p className="bridge-answer">
            저희는 이 질문을 말로만 두지 않고 직접 실험했습니다. 결과는 &ldquo;그렇다&rdquo;였습니다.
          </p>
          <div className="bridge-links">
            <a href={RESEARCH_REPO} target="_blank" rel="noreferrer">실험 코드·원자료 저장소 ↗</a>
            <a href={RESEARCH_RESULTS} target="_blank" rel="noreferrer">실측 결과 보고서 ↗</a>
          </div>
        </div>
      </section>

      <section className="lab-section" id="lab" aria-labelledby="lab-heading">
        <div className="lab-head">
          <div>
            <p>01 · 붕괴 실험</p>
            <h2 id="lab-heading">AI에게 자기 글을 {MAX_GENERATION}번 다시 배우게 하면,<br className="desktop-break" />{" "}무엇이 남을까요?</h2>
          </div>
          <div className="lab-note">
            <b>실측 데이터</b>
            <span>아래 숫자는 예시가 아니라 저희가 직접 돌린 실험의 측정값입니다. 원자료는 공개 저장소에서 확인할 수 있습니다.</span>
          </div>
        </div>

        <div className="lab-controls">
          <fieldset>
            <legend>어떤 언어를 볼까요?</legend>
            <button type="button" aria-pressed={language === "ko"} className={language === "ko" ? "active" : ""} onClick={() => setLanguage("ko")}>한국어</button>
            <button type="button" aria-pressed={language === "en"} className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>영어</button>
          </fieldset>
          <fieldset>
            <legend>무엇을 먹여서 다시 배우게 했나요?</legend>
            {RUNS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={run === item.id}
                className={run === item.id ? `active ${item.tone}` : ""}
                onClick={() => setRun(item.id)}
              >
                {item.label}
              </button>
            ))}
          </fieldset>
        </div>
        <p className="lab-feed"><b>{runMeta.code}</b> {runMeta.feed} — <i>{runMeta.question}</i></p>

        <div className="lab-workspace">
          <div className="generation-control">
            <div>
              <span>반복 횟수</span>
              <b>{generation}번 반복 <small>(G{generation} 세대)</small></b>
            </div>
            <input
              type="range"
              min="0"
              max={MAX_GENERATION}
              step="1"
              value={generation}
              onChange={(event) => setGeneration(Number(event.target.value))}
              aria-label="다시 학습시킨 횟수"
              aria-valuetext={`${generation}번 반복 (G${generation} 세대)`}
            />
            <div className="range-labels">
              <span>0번 · 원본</span>
              <span>4번</span>
              <span>{MAX_GENERATION}번 · 마지막</span>
            </div>
          </div>

          <div className="lab-readout">
            <div className={`lab-trust tone-${labPoint.trust >= 70 ? "safe" : labPoint.trust >= 40 ? "warn" : "danger"}`}>
              <span>{generation}번 반복 뒤 신뢰도</span>
              <b>{labPoint.trust}<small>/100</small></b>
              <i>붕괴도 {labPoint.collapse}%</i>
            </div>
            <div className="lab-metrics">
              <div>
                <span>표현 다양성</span>
                <b>{labPoint.diversity}<small>%</small></b>
                <em>서로 다른 표현이 얼마나 남았는지 (distinct-2)</em>
              </div>
              <div>
                <span>말이 어색해진 정도</span>
                <b>{formatMultiplier(labPoint.pplRatio)}</b>
                <em>원본 대비 퍼플렉시티 배수. 클수록 나쁨</em>
              </div>
              {language === "ko" ? (
                <div>
                  <span>한국어 유지율</span>
                  <b>{labPoint.hangulRetention}<small>%</small></b>
                  <em>한국어로 물었을 때 한글로 답한 비율 (원본 {firstPoint.hangulRatio}% → 지금 {labPoint.hangulRatio}%)</em>
                </div>
              ) : (
                <div>
                  <span>마지막 반복 신뢰도</span>
                  <b>{finalPoint.trust}<small>/100</small></b>
                  <em>{MAX_GENERATION}번 반복했을 때 남은 신뢰도</em>
                </div>
              )}
            </div>
          </div>

          <TrendBars series={series} active={generation} onSelect={setGeneration} />
          <p className="chart-swipe-hint">← 좌우로 밀어 0번부터 {MAX_GENERATION}번 반복까지 보기 →</p>

          <div className="lab-sample">
            <span>실제로 AI가 만들어 낸 문장</span>
            {sampleText ? (
              <>
                <p>{sampleText}</p>
                <small>
                  {runMeta.code} · {sampleGeneration}번 반복(G{sampleGeneration}) 시점의 생성문 일부.
                  {sampleGeneration !== generation ? ` 이 실험은 ${sampleGeneration}번 반복 시점까지의 샘플만 공개되어 있습니다.` : ""}
                </small>
              </>
            ) : (
              <p className="lab-sample-empty">
                {run === "c1"
                  ? "사람이 쓴 글로 계속 학습한 대조군은 세대가 지나도 지표가 평탄했고, 별도 생성문 샘플이 공개되어 있지 않습니다."
                  : "0번 반복(원본) 시점의 생성문 샘플은 공개되어 있지 않습니다. 슬라이더를 오른쪽으로 옮겨 보세요."}
              </p>
            )}
          </div>
        </div>

        <p className="lab-disclaimer">
          이 실험은 직접 처음부터 학습시킨 35M 크기의 작은 모델에서 얻은 결과입니다.
          공개된 모든 GPT가 이미 이렇게 되었다는 뜻이 아니라, &ldquo;AI 글만 반복해서 배우면 어느 방향으로 무너지는가&rdquo;를 통제된 조건에서 보여 주는 결과입니다.
          자세한 조건은 <a href="#research">아래 연구 내용</a>에 정리했습니다.
        </p>
      </section>

      <section className="checker-section" id="inspect" aria-labelledby="checker-title">
        <div className="section-heading on-dark">
          <p>02 · 신뢰도 검사</p>
          <h2 id="checker-title">그럼 지금 내가 받은 답변은<br className="desktop-break" />{" "}<em>얼마나 믿을 수 있을까요?</em></h2>
          <p className="heading-note">방금 본 것처럼 AI 답변은 조용히 무너집니다. 붙여 넣기만 하면 신뢰도와 고쳐야 할 문장을 알려 드립니다.</p>
        </div>

        <ol className="how-to">
          <li><b>1</b><span>평소처럼 AI에게 질문을 한 번 해 보세요.</span></li>
          <li><b>2</b><span>그 질문과 답변을 그대로 복사해 아래에 붙여 넣으세요.</span></li>
          <li><b>3</b><span>신뢰도와 고쳐야 할 문장이 바로 나옵니다.</span></li>
        </ol>

        <div className="checker-shell">
          <form className="checker-form" onSubmit={runCheck} aria-busy={isAnalyzing}>
            <div className="form-head">
              <div><span>붙여 넣기</span><h3>검사할 답변</h3></div>
              <button type="button" className="ghost-button" onClick={loadExample}>예시로 해 보기</button>
            </div>
            <label>
              <span><b>01</b> 무엇을 물어봤나요?</span>
              <textarea
                value={input.question}
                onChange={(event) => update("question", event.target.value)}
                rows={3}
                placeholder="예: 훈민정음 창제 목적을 중학생 수준으로 설명해 줘."
              />
            </label>
            <label>
              <span><b>02</b> AI가 준 답변</span>
              <textarea
                value={input.answer}
                onChange={(event) => update("answer", event.target.value)}
                rows={8}
                required
                aria-invalid={Boolean(formError)}
                aria-describedby="answer-count answer-error"
                placeholder="AI가 만든 답변을 고치지 말고 그대로 붙여 넣으세요."
              />
              <small id="answer-count">{input.answer.length.toLocaleString("ko-KR")}자</small>
            </label>

            <div className="advanced-block">
              <button
                type="button"
                className="advanced-toggle"
                aria-expanded={advancedOpen}
                aria-controls="advanced-panel"
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                <span>고급 설정 <small>{input.referenceText.trim() ? "기준 자료 있음 · 출처 · 사용 목적" : "출처 · 기준 자료 · 사용 목적"}</small></span>
                <b aria-hidden="true">{advancedOpen ? "−" : "+"}</b>
              </button>
              <p className="advanced-hint">사람이 쓴 자료를 함께 넣으면 훨씬 정확하게 검사할 수 있습니다. 없어도 검사는 됩니다.</p>
              <div className="advanced-panel" id="advanced-panel" hidden={!advancedOpen}>
                <fieldset>
                  <legend>어디에 쓸 글인가요?</legend>
                  <div className="purpose-options">
                    {PURPOSES.map((purpose) => (
                      <label key={purpose} className={input.purpose === purpose ? "selected" : ""}>
                        <input
                          type="radio"
                          name="purpose"
                          value={purpose}
                          checked={input.purpose === purpose}
                          onChange={(event) => update("purpose", event.target.value)}
                        />
                        {purpose}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="anchor-inputs">
                  <div className="anchor-title"><span>사람이 쓴 기준 자료</span><em>Human Anchor</em></div>
                  <label>
                    <span>출처 링크 <small>선택</small></span>
                    <input
                      type="url"
                      value={input.sourceUrl ?? ""}
                      onChange={(event) => update("sourceUrl", event.target.value)}
                      placeholder="https://..."
                    />
                  </label>
                  <label>
                    <span>자료 내용 <small>검사에 실제로 사용</small></span>
                    <textarea
                      value={input.referenceText}
                      onChange={(event) => update("referenceText", event.target.value)}
                      rows={7}
                      placeholder="교과서·공공기관·논문처럼 믿을 수 있는 자료에서 관련된 부분을 붙여 넣으세요."
                    />
                  </label>
                  <p>링크는 출처를 적어 두는 용도입니다. 브라우저 제한 때문에 내용 대조에는 붙여 넣은 자료만 사용합니다.</p>
                </div>
              </div>
            </div>

            <p className={formError ? "form-error" : "form-error sr-only"} id="answer-error" role={formError ? "alert" : undefined}>{formError || "답변 입력 상태가 정상입니다."}</p>
            <button className="analyze-button" type="submit" disabled={isAnalyzing}>
              <span>{isAnalyzing ? "문장을 하나씩 확인하는 중…" : "신뢰도 검사하기"}</span>
              <b aria-hidden="true">{isAnalyzing ? "···" : "↗"}</b>
            </button>
            <p className="form-disclaimer">검사 결과는 참고용입니다. 마지막 판단과 수정은 사용자가 직접 해야 합니다.</p>
          </form>

          <section className={isAnalyzing ? "result-panel scanning" : "result-panel"} aria-labelledby="result-title">
            <div className="result-head">
              <div><span>결과</span><h3 id="result-title">이 답변의 신뢰도</h3></div>
              <span className="privacy-chip">● 기기 안에서 검사</span>
            </div>
            <p className="sr-only" role="status" aria-live="polite">{isAnalyzing ? "문장과 근거를 대조하고 있습니다." : `검사가 완료되었습니다. 신뢰도는 ${result.score === null ? "보류" : `${result.score}점`}, 판정은 ${result.verdict}입니다.`}</p>
            {isAnalyzing && <div className="scan-line" aria-hidden="true" />}

            <div className={`trust-block verdict-${result.verdict.replaceAll(" ", "-")}`}>
              <TrustRing value={result.score} tone={verdictTone} caption={result.score === null ? "신뢰도 보류" : "신뢰도"} />
              <div className="trust-copy">
                <strong>{result.verdict}</strong>
                <p>{trustCaption}</p>
                <span>{result.summary}</span>
              </div>
            </div>

            <div className="fatal-strip">
              <div><span>꼭 고쳐야 할 오류</span><b>{fatalCount}</b></div>
              <div><span>근거 없는 주장</span><b>{result.unsupportedCount}</b></div>
              <div><span>확인한 문장</span><b>{result.findings.length}</b></div>
            </div>

            {missingAnchor && (
              <p className="anchor-nudge">
                기준 자료가 없어 <b>글 자체의 상태만</b> 확인했습니다. 내용이 사실인지는 검사하지 못했습니다. <b>고급 설정</b>에 사람이 쓴 자료를 붙여 넣으면 문장마다 사실 여부까지 대조합니다.
              </p>
            )}

            <div className="result-tabs" aria-label="검사 결과 보기">
              <button type="button" aria-pressed={tab === "sentences"} onClick={() => setTab("sentences")}>고쳐야 할 문장 <b>{issueCount}</b></button>
              <button type="button" aria-pressed={tab === "source"} onClick={() => setTab("source")}>자료와 비교</button>
              <button type="button" aria-pressed={tab === "revision"} onClick={() => setTab("revision")}>수정 전후</button>
            </div>

            <div className="tab-body">
              {tab === "sentences" && (
                <div className="finding-list">
                  {result.findings.map((finding) => (
                    <article className={`finding finding-${finding.level}`} key={finding.id}>
                      <div className="finding-index">{String(finding.id).padStart(2, "0")}</div>
                      <div>
                        <div className="finding-label"><span>{finding.label}</span><b>근거 연결 {finding.evidenceScore}%</b></div>
                        <q>{finding.sentence}</q>
                        <p>{finding.issue}</p>
                        {finding.evidenceScore > 0 && finding.evidence && <details><summary>이 문장과 연결된 기준 자료</summary><blockquote>{finding.evidence}</blockquote></details>}
                        {finding.suggestion !== finding.sentence && <div className="suggestion"><span>이렇게 고쳐 보세요</span><p>{finding.suggestion}</p></div>}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {tab === "source" && (
                <div className="source-compare">
                  <article><span>AI 답변</span><p>{checkedInput.answer || "입력된 답변이 없습니다."}</p></article>
                  <article><span>사람이 쓴 자료</span><p>{checkedInput.referenceText || "비교할 기준 자료를 넣지 않았습니다."}</p>{sourceHref && <a href={sourceHref} target="_blank" rel="noreferrer">출처 페이지 열기 ↗</a>}</article>
                </div>
              )}

              {tab === "revision" && (
                <div className="revision-compare">
                  <article><span>수정 전</span><p>{checkedInput.answer}</p></article>
                  <article><span>근거를 반영한 수정안</span><p>{result.revisedAnswer}</p><small>자동 제안입니다. 출처와 앞뒤 문맥을 다시 읽고 직접 확정하세요.</small></article>
                </div>
              )}
            </div>

            <details className="metric-details">
              <summary>세부 점수 6개 자세히 보기</summary>
              <div className="metric-grid">
                {METRIC_KEYS.map((key) => (
                  <div key={key}>
                    <span>{METRIC_LABELS[key]}</span>
                    <b>{result.score === null ? "보류" : result.metrics[key]}</b>
                    <i><em style={{ width: result.score === null ? "0%" : `${result.metrics[key]}%` }} /></i>
                  </div>
                ))}
              </div>
              <p className="metric-note">꼭 고쳐야 할 오류가 있으면 세부 점수가 그 오류를 덮지 않도록 총점을 보류합니다.</p>
            </details>

            <div className="result-actions">
              <button type="button" onClick={copyRevision}>{copied ? "복사했습니다 ✓" : "수정안 복사"}</button>
              <button type="button" onClick={() => window.print()}>인쇄·PDF 저장</button>
              <button type="button" className={approved ? "approved" : ""} aria-pressed={approved} onClick={() => setApproved((value) => !value)}>{approved ? "내 검토 완료 ✓" : "내 검토 완료 표시"}</button>
            </div>
            <p className="approval-note">검토 완료 표시는 이 화면에서만 유지되며, 답변이나 자료를 서버에 저장하지 않습니다.</p>
          </section>
        </div>
      </section>

      <section className="anchor-section" id="anchor" aria-labelledby="anchor-heading">
        <div className="anchor-intro">
          <div className="section-kicker"><span>어떻게 검사하나요</span><i /></div>
          <h2 id="anchor-heading">기준은 다른 AI가 아니라,<br className="desktop-break" />{" "}<em>사람이 쓴 자료</em>입니다.</h2>
          <p>AI 답변을 또 다른 AI 답변과 비교하면 전달 게임이 한 번 더 이어질 뿐입니다. TRASE는 누가 썼는지 확인할 수 있는 사람의 자료에서 사실을 찾고, 빠지거나 뒤바뀐 내용을 문장 단위로 표시합니다.</p>
        </div>
        <ol className="anchor-steps">
          <li><b>01</b><span>사람이 쓴 자료에서</span><strong>핵심 사실 뽑기</strong></li>
          <li><b>02</b><span>AI 답변의 주장과</span><strong>문장별 맞대 보기</strong></li>
          <li><b>03</b><span>빠짐·왜곡·과장을</span><strong>근거와 함께 표시</strong></li>
          <li><b>04</b><span>사용자가 확인한 뒤</span><strong>최종 수정</strong></li>
        </ol>
        <div className="condition-compare">
          <article className="condition-card danger">
            <div><span>이렇게 하면</span><b>AI 글만 반복</b></div>
            <h3>AI 답변을 확인 없이 다시 쓰기</h3>
            <ul><li>반복할수록 세부 정보가 사라짐</li><li>표현이 비슷비슷해짐</li><li>틀린 내용이 다음 자료에 쌓임</li></ul>
            <div className="mini-track"><i style={{ width: `${Math.max(getLabSeries("e1", "ko")[MAX_GENERATION].trust, 4)}%` }} /></div>
            <small>실험 E1 한국어 · {MAX_GENERATION}번 반복 뒤 신뢰도 {getLabSeries("e1", "ko")[MAX_GENERATION].trust}점</small>
          </article>
          <div className="compare-vs">VS</div>
          <article className="condition-card safe">
            <div><span>이렇게 하면</span><b>사람 자료 유지</b></div>
            <h3>사람이 쓴 자료를 기준으로 확인</h3>
            <ul><li>원래 자료를 기준점으로 남겨 둠</li><li>출처와 맞대 본 뒤 고침</li><li>사용자가 확인하기 전에는 쌓지 않음</li></ul>
            <div className="mini-track"><i style={{ width: `${getLabSeries("c1", "ko")[MAX_GENERATION].trust}%` }} /></div>
            <small>실험 C1 한국어 · {MAX_GENERATION}번 반복 뒤 신뢰도 {getLabSeries("c1", "ko")[MAX_GENERATION].trust}점</small>
          </article>
        </div>
        <div className="anchor-principles">
          <span>원문 보존</span><span>확인 전 축적 없음</span><span>모든 수정에 근거 표시</span>
        </div>
      </section>

      <section className="record-section" aria-labelledby="record-title">
        <div className="record-copy">
          <p>기록 남기기</p>
          <h2 id="record-title">답변만 내지 말고,<br className="desktop-break" />{" "}확인한 과정을 남기세요.</h2>
          <p>질문부터 출처 확인, 찾아낸 오류와 수정 제안까지 한 장으로 정리됩니다. 수행평가에서 AI를 어떻게 검토했는지 설명할 수 있습니다.</p>
          <button type="button" onClick={() => window.print()}>지금 기록서 인쇄·PDF 저장 <span>↗</span></button>
        </div>
        <div className="record-paper" aria-label="AI 활용 기록서 미리보기">
          <div><span>TRASE</span><b>AI 활용 및 확인 과정 기록서</b><small>사람 자료 기준</small></div>
          <ol>
            <li><b>01</b><span>처음 질문과 AI 답변</span><i>기록됨</i></li>
            <li><b>02</b><span>찾아낸 오류와 판정 이유</span><i>기록됨</i></li>
            <li><b>03</b><span>확인한 사람 작성 출처</span><i>기록됨</i></li>
            <li><b>04</b><span>수정 전후와 수정 근거</span><i>기록됨</i></li>
            <li><b>05</b><span>사용자 최종 확인</span><i>{approved ? "완료" : "확인 필요"}</i></li>
          </ol>
          <footer><span>판정: {result.verdict}</span><span>{new Date().toLocaleDateString("ko-KR")}</span></footer>
        </div>
      </section>

      <section className="research-section" id="research" aria-labelledby="research-heading">
        <div className="method-head">
          <p>03 · 연구 내용</p>
          <h2 id="research-heading">이 웹사이트는 아래 연구를<br className="desktop-break" />{" "}실생활에 쓰도록 만든 것입니다.</h2>
          <p className="heading-note">여기부터는 발표·심사용 상세 내용입니다. 강한 결론일수록 조건을 함께 공개합니다.</p>
        </div>

        <article className="research-block">
          <h3><span>1</span> 연구의 필요성</h3>
          <div className="research-grid">
            <div>
              <h4>아무도 확인하지 않은 질문이었습니다</h4>
              <p>
                &ldquo;AI가 자기 글을 다시 배우면 성능이 떨어진다&rdquo;는 사실은 이미 여러 연구가 보였습니다.
                하지만 그 실험들은 대부분 <b>영어 한 가지 언어</b>로만 이루어졌습니다.
              </p>
              <p>
                자료가 적은 언어에서 이 붕괴가 <b>어떤 모습으로, 얼마나 빨리</b> 나타나는지는
                한 선행 연구가 &ldquo;아직 열려 있는 질문&rdquo;이라고 직접 지목했을 만큼 비어 있는 자리였습니다.
                언어를 비교한 연구가 아예 없지는 않지만, 강화학습처럼 기제가 다른 상황이거나 자료량이 아니라 문법 유형만 비교한 것이어서
                &ldquo;자료가 적어서 먼저 무너지는가&rdquo;라는 질문에는 답하지 못했습니다.
              </p>
              <p>
                더 비어 있던 자리는 두 번째 질문입니다. <b>영어 글로만 반복 학습했을 때 한국어까지 함께 무너지는지</b>를
                재귀 학습 틀에서 다룬 실험은 조사 시점(2026년 7월) 기준으로 찾지 못했습니다.
              </p>
            </div>
            <div>
              <h4>한국어는 남의 일이 아닙니다</h4>
              <p>
                한국어는 우리가 매일 쓰는 모국어입니다. 수행평가를 쓰고, 검색하고, 질문하는 언어가 한국어입니다.
              </p>
              <p>
                영어 사용자는 겪지 않는 손해를 한국어 사용자만 먼저 겪는다면, 그것은 먼 기술 문제가 아니라
                <b> 우리가 정보를 얼마나 정확하게 얻을 수 있는가</b>의 문제가 됩니다.
                그래서 이 질문을 영어권 연구가 끝나기를 기다리지 않고 직접 확인해 보기로 했습니다.
              </p>
              <p className="research-note">
                한국어를 무조건 &ldquo;저자원 언어&rdquo;로 규정하지는 않습니다. 이 연구에서는 영어보다 상대적으로 학습 자료가 적은 언어로 다룹니다.
              </p>
            </div>
          </div>
        </article>

        <article className="research-block">
          <h3><span>2</span> 연구 방법 및 절차</h3>
          <ol className="research-steps">
            <li>
              <b>모델을 처음부터 직접 학습</b>
              <p>기존 대형 모델을 쓰면 한국어 자료가 얼마나 적었는지 통제할 수 없습니다. 그래서 35M 파라미터(8층, d=512, 문맥 512)의 작은 GPT를 처음부터 학습시켰습니다.</p>
            </li>
            <li>
              <b>실제 자원 불균형을 그대로 재현</b>
              <p>0번째 세대의 학습 자료는 위키피디아 영어 90MB + 한국어 10MB(약 2,640만 토큰)입니다. 웹에서 영어와 한국어 자료가 기울어져 있는 상황을 본떴습니다. 토크나이저는 전 세대 동일하게 고정했습니다.</p>
            </li>
            <li>
              <b>스스로 만든 글로만 다시 학습, {MAX_GENERATION}번 반복</b>
              <p>각 세대 모델이 합성 문장 1,500만 토큰을 만들고, 다음 세대는 그 합성 데이터만으로 처음부터 다시 학습합니다(&ldquo;replace&rdquo; 방식). 이것을 {MAX_GENERATION}번 반복했습니다.</p>
            </li>
            <li>
              <b>세 가지 조건을 나란히 비교</b>
              <p><b>E1</b> 영어·한국어 9:1로 섞어 생성 · <b>E2</b> 영어로만 생성(한국어 완전 배제) · <b>C1</b> 매 세대 사람이 쓴 실제 자료로 재학습(대조군).</p>
            </li>
            <li>
              <b>세대마다 언어별로 측정</b>
              <p>따로 떼어 둔 실제 문서에 대한 퍼플렉시티, 표현 다양성(distinct-2), 단어 분포 엔트로피와 Zipf 기울기, 그리고 한국어로 물었을 때 한글로 답한 비율을 언어별 400개 프롬프트로 측정했습니다.</p>
            </li>
          </ol>
          <p className="research-note">
            위 붕괴 실험의 <b>신뢰도</b>는 측정된 퍼플렉시티를 읽기 쉽게 바꾼 값입니다.
            퍼플렉시티는 자릿수 단위로 커지므로 원본 대비 log₁₀ 증가폭을 사용해{" "}
            <code>신뢰도 = 100 × (1 − log₁₀(현재 PPL ÷ 원본 PPL) ÷ 9)</code>로 계산했습니다.
            분모 9는 실험 전체에서 관측된 최대 악화폭(약 8.96 자릿수)에서 가져왔고, 한국어와 영어에 같은 기준을 적용했습니다.
          </p>
        </article>

        <article className="research-block">
          <h3><span>3</span> 연구 결과</h3>
          <div className="research-findings">
            <div className="research-finding danger">
              <span>질문 1</span>
              <h4>한국어가 먼저, 더 빨리 무너지는가? — 그렇다</h4>
              <p>{MAX_GENERATION}번 반복 뒤 퍼플렉시티가 영어는 약 20만 배 나빠진 반면 한국어는 약 2.0억 배 나빠졌습니다. 세대당 악화 기울기로 보면 한국어가 약 <b>1.6배 빠릅니다</b>.</p>
              <p>완전히 무너지기 전에 <b>언어부터 이탈</b>했습니다. 한국어로 물었을 때 한글로 답한 비율이 12.0% → 2번 반복 만에 4.6% → 마지막에는 0.97%였습니다.</p>
            </div>
            <div className="research-finding warn">
              <span>질문 2</span>
              <h4>영어만 반복해도 한국어가 무너지는가? — 그렇다, 더 심하게</h4>
              <p>학습 자료에 한국어가 <b>한 글자도 없었는데도</b> 한국어 퍼플렉시티가 약 9.0억 배 나빠졌습니다. 같은 조건의 영어(약 17만 배)보다 훨씬 심합니다.</p>
              <p>합성 자료에 한국어가 조금이라도 남아 있던 E1보다 마지막 한국어 성능이 약 5배 더 나빴습니다. &ldquo;영어로만 학습하니 한국어는 안전하다&rdquo;는 가정은 성립하지 않습니다.</p>
            </div>
            <div className="research-finding safe">
              <span>대조군</span>
              <h4>사람이 쓴 자료로 반복하면? — 거의 변화 없음</h4>
              <p>매 세대 실제 자료로 다시 학습한 C1은 9번을 반복해도 퍼플렉시티와 한글 응답률이 평탄했습니다. 관측된 붕괴가 &ldquo;여러 번 재학습해서&rdquo; 생긴 것이 아니라 <b>합성 데이터 루프 때문</b>이라는 뜻입니다.</p>
            </div>
          </div>
          <p className="research-note">
            정성적으로도 같은 방향이었습니다. 1번 반복에서 한글과 영어가 뒤섞이고, 4번 반복에서 한글이 거의 사라지며, {MAX_GENERATION}번 반복에서는 의미 없는 조각만 남았습니다.
            위 <a href="#lab">붕괴 실험</a>에서 실제 생성문을 직접 확인할 수 있습니다.
          </p>
        </article>

        <article className="research-block">
          <h3><span>4</span> 한계와 하지 않는 것</h3>
          <div className="limit-grid">
            <article><span>01</span><h4>모델 크기</h4><p>35M 크기 모델을 처음부터 학습한 결과입니다. 대형 사전학습 LLM에 그대로 일반화되는지는 확인하지 않았습니다.</p></article>
            <article><span>02</span><h4>실험 조건</h4><p>합성 데이터로 전부 교체하는 &ldquo;replace&rdquo; 방식은 붕괴의 상한을 보는 설정입니다. 실제 자료를 섞어 누적하는 조건은 후속 과제이고, 시드는 1개입니다.</p></article>
            <article><span>03</span><h4>검사기의 한계</h4><p>TRASE 검사기는 브라우저 안에서 도는 규칙 기반 도구입니다. 사실 여부를 확정하거나 AI가 썼는지 판정하지 않습니다. 링크는 표시용이며 내용 대조에는 붙여 넣은 자료만 씁니다.</p></article>
            <article><span>04</span><h4>TRASE가 하지 않는 것</h4><p>GPT의 학습 구조를 바꾸지 않습니다. 사용자가 받은 답변을 사람 자료와 맞대 보아 지금 생기는 정보 손실을 줄이는 도구입니다.</p></article>
          </div>
        </article>

        <div className="research-links">
          <a href={RESEARCH_REPO} target="_blank" rel="noreferrer"><span>실험 저장소</span><b>recursive-collapse-ko</b><p>실험 코드, 세대별 지표 JSON, 생성 문장 샘플, 그래프를 모두 공개했습니다.</p><i>↗</i></a>
          <a href={RESEARCH_RESULTS} target="_blank" rel="noreferrer"><span>결과 보고서</span><b>RECURSIVE_COLLAPSE_RESULTS.md</b><p>설정 요약, 질문별 결과 수치, 정성 샘플, 한계를 정리한 보고서입니다.</p><i>↗</i></a>
          <a href="https://arxiv.org/abs/2305.17493" target="_blank" rel="noreferrer"><span>선행 연구 · arXiv</span><b>The Curse of Recursion</b><p>재귀 학습으로 모델이 붕괴한다는 것을 보인 원조 실험입니다. 영어 한 가지 언어만 다뤘습니다.</p><i>↗</i></a>
          <a href="https://www.nature.com/articles/s41586-024-07566-y" target="_blank" rel="noreferrer"><span>선행 연구 · Nature</span><b>재귀 생성 데이터와 모델 붕괴</b><p>재귀 생성물을 가리지 않고 학습하면 희귀한 정보와 품질이 사라질 수 있음을 보였습니다. 한국어와 영어를 비교한 연구는 아닙니다.</p><i>↗</i></a>
          <a href="https://arxiv.org/abs/2404.01413" target="_blank" rel="noreferrer"><span>선행 연구 · arXiv</span><b>실제 데이터를 함께 누적하면</b><p>원본 실제 데이터를 유지한 채 합성 데이터를 누적하면 붕괴를 피할 수 있는 조건을 보고했습니다. TRASE 검사기 자체를 검증한 논문은 아닙니다.</p><i>↗</i></a>
          <a href="https://arxiv.org/abs/2506.05850" target="_blank" rel="noreferrer"><span>선행 연구 · arXiv</span><b>Cross-lingual Collapse</b><p>강화학습에서 자원량 순서대로 언어 이탈이 나타남을 보고했습니다. 재귀 학습과는 기제가 다릅니다.</p><i>↗</i></a>
        </div>
      </section>

      <section className="closing-section">
        <p>관찰에서 멈추지 않기</p>
        <h2>한국어가 무너지는 걸 확인하는 데서 끝내지 않고,<br className="desktop-break" />{" "}<em>지금 쓰는 한 문장</em>부터 지킵니다.</h2>
        <a href="#inspect">내 AI 답변 검사하기 <span>↗</span></a>
      </section>
      </main>

      <footer className="site-footer">
        <div className="brand"><span className="brand-mark" aria-hidden="true">T</span><span className="brand-lockup"><strong>TRASE</strong><small>AI 답변 신뢰도 검사</small></span></div>
        <p><b>Trusted Response Assessment &amp; Source Evaluation</b><span>사람이 쓴 자료를 기준으로 한국어 AI 답변을 확인합니다</span></p>
        <a href="https://github.com/F990bum/GP2" target="_blank" rel="noreferrer">GitHub ↗</a>
      </footer>

      <section className="print-report" aria-hidden="true">
        <header><b>TRASE</b><span>AI 활용 및 확인 과정 기록서</span></header>
        <h1>한국어 AI 답변 확인 기록</h1>
        <dl><div><dt>사용 목적</dt><dd>{checkedInput.purpose}</dd></div><div><dt>신뢰도</dt><dd>{result.score === null ? "보류 (오류 우선)" : `${result.score}점`}</dd></div><div><dt>최종 판정</dt><dd>{result.verdict}</dd></div><div><dt>검사 일자</dt><dd>{new Date().toLocaleDateString("ko-KR")}</dd></div></dl>
        <h2>1. 사용한 질문</h2><p>{checkedInput.question || "기록 없음"}</p>
        <h2>2. 처음 받은 AI 답변</h2><p>{checkedInput.answer}</p>
        <h2>3. 확인한 사람 작성 자료</h2><p>{checkedInput.referenceText || "입력된 기준 자료 없음"}</p>{checkedInput.sourceUrl && <p>출처: {checkedInput.sourceUrl}</p>}
        <h2>4. 찾아낸 오류</h2><ol>{result.findings.filter((finding) => finding.level !== "good").map((finding) => <li key={finding.id}><b>{finding.label}</b> — {finding.issue}</li>)}</ol>
        <h2>5. 근거를 반영한 수정안</h2><p>{result.revisedAnswer}</p>
        <footer>이 기록서는 TRASE의 규칙 기반 검사 결과입니다. 최종 제출 전에 사용자가 출처와 문장을 직접 확인해야 합니다.</footer>
      </section>
    </>
  );
}
