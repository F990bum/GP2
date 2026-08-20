# TRASE

**Trusted Response Assessment & Source Evaluation**

한국어 AI 답변을 인간 작성 자료와 대조해 근거 부족, 의미 충돌, 표현 반복과 정보 손실을 찾는 **한국어 AI 답변 품질 방화벽**입니다.

서비스: [https://f990bum.github.io/GP2/](https://f990bum.github.io/GP2/)

## MVP 기능

- 질문·AI 답변·출처 URL·인간 기준 자료 입력
- 출처 부재·수치 충돌 등 치명적 오류 우선 판정
- 근거성, 의미 정확성, 한국어 품질, 표현 다양성, 정보 보존, 투명성 검사
- 문장별 문제·연결 근거·수정 제안
- 원문과 수정안 비교 및 복사
- 브라우저 인쇄를 이용한 AI 활용·검증 과정 PDF 저장
- 한국어/영어, 재귀학습/인간 기준점 조건을 비교하는 G0–G10 실험 UI
- 연구 범위와 해석 한계 공개

검사는 브라우저에서 실행되며 입력한 답변을 서버에 저장하거나 학습 데이터로 사용하지 않습니다.

## 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
npm run dev
```

검증:

```bash
npm test
npm run lint
```

## 중요한 한계

- 현재 검사기는 해커톤용 규칙 기반 MVP입니다. 사실 확인을 확정하거나 AI 작성 여부를 판정하지 않습니다.
- 출처 URL은 표시용이며, 브라우저 CORS 제한 때문에 의미 대조에는 사용자가 붙여 넣은 자료 본문을 사용합니다.
- 붕괴 실험실의 수치는 인터랙션을 검증하기 위한 정규화 예시 데이터입니다. 발표용 수치로 사용하기 전에 실제 원시 실험값으로 교체해야 합니다.
- TRASE는 GPT 자체의 학습 구조를 바꾸지 않습니다. 사용자가 접하는 답변을 인간 자료와 대조하는 도구입니다.

## 연구 배경

- [Is Model Collapse Inevitable? Breaking the Curse of Recursion by Accumulating Real and Synthetic Data](https://arxiv.org/abs/2404.01413)
- [AI models collapse when trained on recursively generated data](https://www.nature.com/articles/s41586-024-07566-y)
- [Machine-generated text detection prevents language model collapse](https://aclanthology.org/2025.emnlp-main.1506/)

## 기술 구성

React 19, TypeScript와 Vite를 사용합니다. `main` 브랜치가 변경되면 GitHub Actions가 `/GP2/` 경로용 정적 파일을 빌드해 GitHub Pages에 배포합니다.
