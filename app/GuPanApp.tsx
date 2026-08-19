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
  type LabCondition,
  type LabLanguage,
  type LabPoint,
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

function safeLink(value?: string) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function TrendBars({ series, active, onSelect }: { series: LabPoint[]; active: number; onSelect: (generation: number) => void }) {
  return (
    <div className="trend-bars" aria-label="세대별 정확도 변화 그래프">
      <div className="chart-grid" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="bar-columns">
        {series.map((point) => (
          <button
            type="button"
            className={point.generation === active ? "bar-column active" : "bar-column"}
            key={point.generation}
            style={{ "--bar-height": `${point.accuracy}%` } as CSSProperties}
            aria-label={`G${point.generation} 정확도 ${point.accuracy}`}
            onClick={() => onSelect(point.generation)}
          >
            <i><b /></i><span>G{point.generation}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function GuPanApp() {
  const [input, setInput] = useState<CheckInput>(SAMPLE);
  const [result, setResult] = useState<AnalysisResult>(() => analyzeAnswer(SAMPLE));
  const [tab, setTab] = useState<"sentences" | "source" | "revision">("sentences");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [formError, setFormError] = useState("");
  const [copied, setCopied] = useState(false);
  const [approved, setApproved] = useState(false);
  const [language, setLanguage] = useState<LabLanguage>("ko");
  const [condition, setCondition] = useState<LabCondition>("recursive");
  const [generation, setGeneration] = useState(10);

  const series = useMemo(() => getLabSeries(language, condition), [language, condition]);
  const labPoint = series[generation];
  const finalPoint = series[series.length - 1];
  const accuracySlope = (finalPoint.accuracy - series[0].accuracy) / (series.length - 1);
  const retention = Math.round((finalPoint.accuracy / series[0].accuracy) * 100);
  const sourceHref = safeLink(input.sourceUrl);

  const update = (key: keyof CheckInput, value: string) => {
    setInput((current) => ({ ...current, [key]: value }));
    setApproved(false);
  };

  const runCheck = (event?: FormEvent) => {
    event?.preventDefault();
    if (!input.answer.trim()) {
      setFormError("검사할 AI 답변을 입력해 주세요.");
      return;
    }
    setFormError("");
    setIsAnalyzing(true);
    setApproved(false);
    window.setTimeout(() => {
      setResult(analyzeAnswer(input));
      setIsAnalyzing(false);
      setTab("sentences");
    }, 520);
  };

  const loadExample = () => {
    setInput(SAMPLE);
    setResult(analyzeAnswer(SAMPLE));
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
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="GuPan 2.0 홈">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span>GuPan <b>2.0</b></span>
        </a>
        <nav aria-label="주요 메뉴">
          <a href="#inspect">답변 검사</a>
          <a href="#anchor">작동 원리</a>
          <a href="#lab">붕괴 실험실</a>
          <a href="#method">연구·한계</a>
        </nav>
        <a className="header-cta" href="#inspect">무료로 검사하기</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> KOREAN ANSWER FIREWALL · GUPAN 2.0</p>
          <h1>AI가 AI의 답변만 배운다면,<br /><em>한국어</em>는 어떻게 될까요?</h1>
          <p className="hero-lede">
            우리는 재귀 실험에서 한국어 품질이 더 빠르게 낮아지는 현상을 관찰했습니다.
            GuPan은 인간 작성 자료를 기준으로 답변의 오류와 정보 손실을 제출 전에 막습니다.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#inspect">내 AI 답변 검사하기 <span>↗</span></a>
            <a className="text-link" href="#lab">붕괴 실험 먼저 보기 <span>→</span></a>
          </div>
          <p className="hero-note"><span>✓</span> 검증되지 않은 답변은 저장하거나 학습 데이터로 사용하지 않습니다.</p>
        </div>

        <div className="collapse-card" aria-label="한국어 답변 붕괴 표본">
          <div className="collapse-card-head">
            <span>RECURSIVE SAMPLE · KO</span>
            <strong>G0 → G10</strong>
          </div>
          <div className="collapse-sample generation-zero">
            <span>G0 · 인간 원자료</span>
            <p>인공지능은 <mark>인간이 만든 자료</mark>에서 패턴을 배우며, 자료의 <mark>출처와 다양성</mark>이 답변 품질에 영향을 준다.</p>
          </div>
          <div className="collapse-arrow" aria-hidden="true"><i /><b>반복 학습 10회</b><i /></div>
          <div className="collapse-sample generation-ten">
            <span>G10 · AI 출력만 재사용</span>
            <p><del>인공지능은 인간이 만든</del> 자료는 중요하다. <del>출처와 다양성이 답변 품질에 영향을 준다.</del> 자료는 중요하다.</p>
          </div>
          <div className="collapse-flags">
            <span>정보 손실</span><span>표현 반복</span><span>근거 소실</span>
          </div>
          <p className="demo-caption">문장 변화 예시 · 실제 실험 수치는 붕괴 실험실에서 별도 공개</p>
        </div>
      </section>

      <section className="observation" aria-labelledby="observation-title">
        <div className="section-kicker"><span>OBSERVATION → ACTION</span><i /></div>
        <div className="observation-copy">
          <p>관찰에서 멈추지 않았습니다.</p>
          <h2 id="observation-title">무너지는 과정을 보여 주는 데서,<br />지금 쓰는 한 문장을 지키는 도구로.</h2>
        </div>
        <div className="condition-compare">
          <article className="condition-card danger">
            <div><span>조건 A</span><b>RAW RECURSION</b></div>
            <h3>AI 출력만 반복 사용</h3>
            <ul><li>세대마다 세부 정보 소실</li><li>같은 문장 구조로 수렴</li><li>오류가 다음 데이터에 누적</li></ul>
            <div className="mini-track"><i style={{width:"31%"}} /></div>
            <small>원자료 연결이 끊기는 경로</small>
          </article>
          <div className="compare-vs">VS</div>
          <article className="condition-card safe">
            <div><span>조건 B</span><b>HUMAN ANCHOR</b></div>
            <h3>인간 자료 보존 + 검증</h3>
            <ul><li>원본 인간 자료를 기준점으로 유지</li><li>출처 대조 후 수정</li><li>사용자 승인 전 자동 축적 없음</li></ul>
            <div className="mini-track"><i style={{width:"92%"}} /></div>
            <small>원자료와 연결을 유지하는 경로</small>
          </article>
        </div>
      </section>

      <section className="checker-section" id="inspect" aria-labelledby="checker-title">
        <div className="section-heading on-dark">
          <p>01 · ANSWER CHECK</p>
          <h2 id="checker-title">점수보다 먼저,<br />치명적인 오류를 찾습니다.</h2>
          <p className="heading-note">문법 점수가 사실 오류를 덮지 않도록 출처 부재·의미 충돌·수치 불일치를 우선 판정합니다.</p>
        </div>

        <div className="checker-shell">
          <form className="checker-form" onSubmit={runCheck}>
            <div className="form-head">
              <div><span>INPUT</span><h3>검사할 답변</h3></div>
              <button type="button" className="ghost-button" onClick={loadExample}>예시 답변 불러오기</button>
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
              <span><b>02</b> 검사할 AI 답변</span>
              <textarea
                value={input.answer}
                onChange={(event) => update("answer", event.target.value)}
                rows={8}
                placeholder="AI가 생성한 답변을 수정하지 않고 그대로 붙여 넣으세요."
              />
              <small>{input.answer.length.toLocaleString("ko-KR")}자</small>
            </label>
            <fieldset>
              <legend><b>03</b> 사용 목적</legend>
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
              <div className="anchor-title"><span><b>04</b> 인간 기준 자료</span><em>Human Anchor</em></div>
              <label>
                <span>출처 URL <small>선택</small></span>
                <input
                  type="url"
                  value={input.sourceUrl ?? ""}
                  onChange={(event) => update("sourceUrl", event.target.value)}
                  placeholder="https://..."
                />
              </label>
              <label>
                <span>자료 본문 <small>검사에 사용</small></span>
                <textarea
                  value={input.referenceText}
                  onChange={(event) => update("referenceText", event.target.value)}
                  rows={7}
                  placeholder="교과서·공공기관·논문 등 신뢰할 수 있는 자료의 관련 부분을 붙여 넣으세요."
                />
              </label>
              <p>URL은 출처 표시에 사용됩니다. 브라우저 제한 때문에 실제 의미 대조에는 붙여 넣은 본문을 사용합니다.</p>
            </div>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <button className="analyze-button" type="submit" disabled={isAnalyzing}>
              <span>{isAnalyzing ? "문장과 근거를 대조하는 중…" : "한국어 답변 검사 시작"}</span>
              <b aria-hidden="true">{isAnalyzing ? "···" : "↗"}</b>
            </button>
            <p className="form-disclaimer">검사 결과는 참고 자료입니다. 최종 판단과 수정은 사용자가 직접 확인해야 합니다.</p>
          </form>

          <section className={isAnalyzing ? "result-panel scanning" : "result-panel"} aria-live="polite">
            <div className="result-head">
              <div><span>RESULT</span><h3>품질 방화벽 리포트</h3></div>
              <span className="privacy-chip">● 기기 안에서 검사</span>
            </div>
            {isAnalyzing && <div className="scan-line" aria-hidden="true" />}
            <div className={`verdict-block verdict-${result.verdict.replaceAll(" ", "-")}`}>
              <div>
                <p>치명적 오류 우선 판정</p>
                <strong>{result.verdict}</strong>
                <span>{result.summary}</span>
              </div>
              <div className="result-score">
                <b>{result.score ?? "—"}</b>
                <small>{result.score === null ? "점수 보류" : "/ 100"}</small>
              </div>
            </div>

            <div className="fatal-strip">
              <div><span>출처·내용 충돌</span><b>{result.fatalErrors.length}</b></div>
              <div><span>근거 없는 주장</span><b>{result.unsupportedCount}</b></div>
              <div><span>확인 문장</span><b>{result.findings.length}</b></div>
            </div>

            <div className="metric-grid">
              {METRIC_KEYS.map((key) => (
                <div key={key}>
                  <span>{METRIC_LABELS[key]}</span>
                  <b>{result.score === null ? "보류" : result.metrics[key]}</b>
                  <i><em style={{width: result.score === null ? "0%" : `${result.metrics[key]}%`}} /></i>
                </div>
              ))}
            </div>

            <div className="result-tabs" role="tablist" aria-label="검사 결과 보기">
              <button type="button" role="tab" aria-selected={tab === "sentences"} onClick={() => setTab("sentences")}>문장별 문제 <b>{result.findings.filter((item) => item.level !== "good").length}</b></button>
              <button type="button" role="tab" aria-selected={tab === "source"} onClick={() => setTab("source")}>출처 대조</button>
              <button type="button" role="tab" aria-selected={tab === "revision"} onClick={() => setTab("revision")}>수정 전후</button>
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
                        {finding.evidence && <details><summary>연결된 인간 기준 자료</summary><blockquote>{finding.evidence}</blockquote></details>}
                        {finding.suggestion !== finding.sentence && <div className="suggestion"><span>수정 제안</span><p>{finding.suggestion}</p></div>}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {tab === "source" && (
                <div className="source-compare">
                  <article><span>AI ANSWER</span><p>{input.answer || "입력된 답변이 없습니다."}</p></article>
                  <article><span>HUMAN ANCHOR</span><p>{input.referenceText || "비교할 인간 기준 자료가 없습니다."}</p>{sourceHref && <a href={sourceHref} target="_blank" rel="noreferrer">출처 페이지 열기 ↗</a>}</article>
                </div>
              )}

              {tab === "revision" && (
                <div className="revision-compare">
                  <article><span>수정 전</span><p>{input.answer}</p></article>
                  <article><span>근거 기반 수정안</span><p>{result.revisedAnswer}</p><small>자동 제안입니다. 출처와 문맥을 다시 읽고 직접 확정하세요.</small></article>
                </div>
              )}
            </div>

            <div className="result-actions">
              <button type="button" onClick={copyRevision}>{copied ? "복사했습니다 ✓" : "수정안 복사"}</button>
              <button type="button" onClick={() => window.print()}>검증 기록서 PDF</button>
              <button type="button" className={approved ? "approved" : ""} onClick={() => setApproved((value) => !value)}>{approved ? "내 검토 완료 ✓" : "내 검토 완료 표시"}</button>
            </div>
            <p className="approval-note">검토 완료 표시는 이 화면에서만 유지되며 답변이나 자료를 서버에 저장하지 않습니다.</p>
          </section>
        </div>
      </section>

      <section className="anchor-section" id="anchor" aria-labelledby="anchor-heading">
        <div className="anchor-intro">
          <div className="section-kicker"><span>HUMAN ANCHOR</span><i /></div>
          <h2 id="anchor-heading">기준점은 AI가 아니라,<br /><em>사람이 쓴 자료</em>입니다.</h2>
          <p>GuPan은 AI 답변을 또 다른 AI 답변과 비교하지 않습니다. 작성 주체와 출처를 확인할 수 있는 인간 자료에서 사실을 찾고, 빠지거나 왜곡된 내용을 표시합니다.</p>
        </div>
        <ol className="anchor-steps">
          <li><b>01</b><span>인간 자료에서</span><strong>핵심 사실 추출</strong></li>
          <li><b>02</b><span>AI 답변의 주장과</span><strong>문장별 대조</strong></li>
          <li><b>03</b><span>누락·왜곡·과장을</span><strong>근거와 표시</strong></li>
          <li><b>04</b><span>사용자가 확인한 뒤</span><strong>최종 수정</strong></li>
        </ol>
        <div className="anchor-principles">
          <span>원문 보존</span><span>승인 전 축적 없음</span><span>모든 수정에 근거 표시</span>
        </div>
      </section>

      <section className="record-section" aria-labelledby="record-title">
        <div className="record-copy">
          <p>AI USE RECORD</p>
          <h2 id="record-title">답변만 제출하지 말고,<br />검증 과정을 남기세요.</h2>
          <p>질문부터 출처 확인, 직접 수정한 부분까지 한 문서로 정리합니다. 수행평가에서 AI를 어떻게 검토했는지 설명할 수 있습니다.</p>
          <button type="button" onClick={() => window.print()}>현재 기록서 PDF로 저장 <span>↗</span></button>
        </div>
        <div className="record-paper" aria-label="AI 활용 기록서 미리보기">
          <div><span>GuPan 2.0</span><b>AI 활용 및 검증 과정 기록서</b><small>HUMAN-ANCHORED REVIEW</small></div>
          <ol>
            <li><b>01</b><span>최초 질문과 AI 답변</span><i>기록됨</i></li>
            <li><b>02</b><span>발견된 오류와 판정 이유</span><i>기록됨</i></li>
            <li><b>03</b><span>확인한 인간 작성 출처</span><i>기록됨</i></li>
            <li><b>04</b><span>수정 전후와 수정 근거</span><i>기록됨</i></li>
            <li><b>05</b><span>사용자 최종 확인</span><i>{approved ? "완료" : "확인 필요"}</i></li>
          </ol>
          <footer><span>판정: {result.verdict}</span><span>{new Date().toLocaleDateString("ko-KR")}</span></footer>
        </div>
      </section>

      <section className="lab-section" id="lab" aria-labelledby="lab-heading">
        <div className="lab-head">
          <div>
            <p>02 · COLLAPSE LAB</p>
            <h2 id="lab-heading">10번 다시 학습시키면,<br />무엇이 남을까?</h2>
          </div>
          <div className="lab-note"><b>DEMO DATA</b><span>아래 수치는 화면 동작을 보여 주는 정규화 예시입니다. 발표 전 실제 원시 실험값으로 교체해야 합니다.</span></div>
        </div>

        <div className="lab-controls">
          <fieldset><legend>언어</legend><button type="button" className={language === "ko" ? "active" : ""} onClick={() => setLanguage("ko")}>한국어</button><button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>English</button></fieldset>
          <fieldset><legend>학습 조건</legend><button type="button" className={condition === "recursive" ? "active danger" : ""} onClick={() => setCondition("recursive")}>AI 출력만 반복</button><button type="button" className={condition === "anchored" ? "active safe" : ""} onClick={() => setCondition("anchored")}>GuPan 보호 방식</button></fieldset>
        </div>

        <div className="lab-workspace">
          <div className="generation-control">
            <div><span>GENERATION</span><b>G{generation}</b></div>
            <input type="range" min="0" max="10" step="1" value={generation} onChange={(event) => setGeneration(Number(event.target.value))} aria-label="세대 선택" />
            <div className="range-labels"><span>G0 · 원본</span><span>G5</span><span>G10 · 최종</span></div>
          </div>
          <div className="lab-texts">
            <article><span>ORIGINAL · G0</span><p>{series[0].text}</p></article>
            <article className={condition === "recursive" ? "is-recursive" : "is-anchored"}><span>CURRENT · G{generation}</span><p>{labPoint.text}</p></article>
          </div>
          <TrendBars series={series} active={generation} onSelect={setGeneration} />
          <div className="lab-metrics">
            <div><span>선택 세대 정확도</span><b>{labPoint.accuracy}<small>/100</small></b></div>
            <div><span>표현 다양성</span><b>{labPoint.diversity}<small>/100</small></b></div>
            <div><span>반복률</span><b>{labPoint.repetition}<small>%</small></b></div>
            <div><span>세대당 정확도 변화</span><b>{accuracySlope.toFixed(1)}<small>점</small></b></div>
            <div><span>G10 성능 보존율</span><b>{retention}<small>%</small></b></div>
          </div>
        </div>
        <p className="lab-disclaimer">이 화면은 공개된 모든 GPT의 상태가 아니라, 본 프로젝트가 제안한 실험 구조의 인터랙션 데모입니다. 실제 결론은 사용 모델·데이터·프롬프트·재귀 조건과 함께 해석해야 합니다.</p>
      </section>

      <section className="method-section" id="method" aria-labelledby="method-heading">
        <div className="method-head">
          <p>03 · METHOD & LIMITS</p>
          <h2 id="method-heading">강한 결론일수록,<br />조건을 함께 공개합니다.</h2>
        </div>
        <div className="limit-grid">
          <article><span>01</span><h3>한국어의 위치</h3><p>한국어를 무조건 저자원 언어로 규정하지 않습니다. 이 프로젝트에서는 영어보다 상대적으로 학습 자료가 적은 언어로 다룹니다.</p></article>
          <article><span>02</span><h3>실험의 범위</h3><p>한국어의 빠른 품질 저하는 사용한 모델·데이터·프롬프트와 재귀 조건에서 관찰된 결과이며, 모든 GPT에 일반화하지 않습니다.</p></article>
          <article><span>03</span><h3>탐지의 한계</h3><p>AI 생성 여부는 참고 신호일 뿐입니다. 사람과 AI를 확정적으로 구분하는 판정이나 개별 문장의 진실 판정에 사용하지 않습니다.</p></article>
          <article><span>04</span><h3>GuPan이 하지 않는 것</h3><p>GPT 자체의 학습 구조를 바꾸지 않습니다. 사용자가 접하는 답변을 인간 자료와 대조해 실제 정보 손실을 줄이는 도구입니다.</p></article>
        </div>
        <div className="research-links">
          <a href="https://arxiv.org/abs/2404.01413" target="_blank" rel="noreferrer"><span>2024 · ARXIV</span><b>원본 실제 데이터 보존과 합성 데이터 누적</b><p>원본을 유지하며 합성 데이터를 누적한 실험에서 붕괴를 피한 조건을 보고했습니다.</p><i>↗</i></a>
          <a href="https://www.nature.com/articles/s41586-024-07566-y" target="_blank" rel="noreferrer"><span>2024 · NATURE</span><b>재귀 생성 데이터와 모델 붕괴</b><p>재귀 생성물을 무분별하게 학습할 때 희귀 정보와 품질이 소실될 수 있음을 보였습니다.</p><i>↗</i></a>
          <a href="https://aclanthology.org/2025.emnlp-main.1506/" target="_blank" rel="noreferrer"><span>2025 · EMNLP</span><b>생성 데이터 출처 추정과 비중 조정</b><p>인간 작성 가능성이 높은 표본의 비중을 높여 붕괴를 완화하는 방법을 연구했습니다.</p><i>↗</i></a>
        </div>
      </section>

      <section className="closing-section">
        <p>FROM OBSERVATION TO PROTECTION</p>
        <h2>한국어의 붕괴를 관찰하는 데서 끝나지 않고,<br /><em>지금 사용하는 한 문장의 손해</em>부터 줄입니다.</h2>
        <a href="#inspect">내 AI 답변 검사하기 <span>↗</span></a>
      </section>

      <footer className="site-footer">
        <div className="brand"><span className="brand-mark" aria-hidden="true">G</span><span>GuPan <b>2.0</b></span></div>
        <p>한국어 AI 답변 품질 방화벽 · Human-anchored answer review</p>
        <a href="https://github.com/F990bum/GP2" target="_blank" rel="noreferrer">GitHub ↗</a>
      </footer>

      <section className="print-report" aria-hidden="true">
        <header><b>GuPan 2.0</b><span>AI 활용 및 검증 과정 기록서</span></header>
        <h1>한국어 AI 답변 검증 기록</h1>
        <dl><div><dt>사용 목적</dt><dd>{input.purpose}</dd></div><div><dt>최종 판정</dt><dd>{result.verdict}</dd></div><div><dt>검사 일자</dt><dd>{new Date().toLocaleDateString("ko-KR")}</dd></div></dl>
        <h2>1. 사용한 질문</h2><p>{input.question || "기록 없음"}</p>
        <h2>2. 최초 AI 답변</h2><p>{input.answer}</p>
        <h2>3. 확인한 인간 기준 자료</h2><p>{input.referenceText || "입력된 기준 자료 없음"}</p>{input.sourceUrl && <p>출처: {input.sourceUrl}</p>}
        <h2>4. 발견된 오류</h2><ol>{result.findings.filter((finding) => finding.level !== "good").map((finding) => <li key={finding.id}><b>{finding.label}</b> — {finding.issue}</li>)}</ol>
        <h2>5. 근거 기반 수정안</h2><p>{result.revisedAnswer}</p>
        <footer>이 기록서는 GuPan 2.0의 규칙 기반 MVP 검사 결과입니다. 최종 제출 전 사용자가 출처와 문장을 직접 확인해야 합니다.</footer>
      </section>
    </main>
  );
}
