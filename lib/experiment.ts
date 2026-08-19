export type LabLanguage = "ko" | "en";
export type LabCondition = "recursive" | "anchored";

export type LabPoint = {
  generation: number;
  accuracy: number;
  diversity: number;
  repetition: number;
  text: string;
};

const koRecursiveText = [
  "인공지능은 인간이 만든 자료에서 패턴을 배우며, 자료의 출처와 다양성이 답변 품질에 영향을 준다.",
  "인공지능은 인간 자료의 패턴을 배우며, 자료 다양성이 답변 품질에 영향을 준다.",
  "인공지능은 자료의 패턴을 배우고 다양성에 영향을 받는다.",
  "인공지능은 자료를 배우고 자료에 영향을 받는다.",
  "인공지능은 자료를 배우며 영향을 받는다.",
  "인공지능은 자료를 배우고 답변한다.",
  "인공지능은 자료를 배우고 답변한다. 자료가 중요하다.",
  "인공지능은 자료를 배우고 답변한다. 자료는 중요하다.",
  "자료는 중요하다. 인공지능은 자료를 답변한다.",
  "자료는 중요하다. 자료는 답변을 만든다.",
  "자료는 중요하다. 자료는 중요하다.",
];

const koAnchoredText = [
  "인공지능은 인간이 만든 자료에서 패턴을 배우며, 자료의 출처와 다양성이 답변 품질에 영향을 준다.",
  "인공지능은 인간 작성 자료에서 패턴을 배우며, 출처와 다양성이 답변 품질에 영향을 준다.",
  "인공지능은 검증된 인간 자료에서 패턴을 배우고, 자료의 출처와 다양성에 영향을 받는다.",
  "인공지능 답변의 품질은 학습한 인간 자료의 출처와 다양성에 영향을 받는다.",
  "인공지능은 인간 자료의 패턴을 배우므로 원자료의 출처와 다양성을 보존해야 한다.",
  "인공지능은 인간 자료에서 패턴을 배우며, 원자료 보존은 답변 품질 유지에 중요하다.",
  "인공지능 답변의 품질을 지키려면 인간 원자료의 출처와 다양성을 함께 보존해야 한다.",
  "인공지능은 인간 작성 원자료를 기준으로 삼을 때 출처와 표현의 다양성을 지키기 쉽다.",
  "인간 원자료를 보존하면 인공지능 답변의 근거와 표현 다양성을 점검할 수 있다.",
  "인간 원자료는 인공지능 답변의 근거와 다양성을 확인하는 기준점이 된다.",
  "인간 원자료를 기준점으로 보존하면 인공지능 답변의 근거와 다양성을 계속 확인할 수 있다.",
];

const enRecursiveText = [
  "AI learns patterns from human-made data, and source quality and diversity affect the quality of its answers.",
  "AI learns patterns from human data, and diversity affects answer quality.",
  "AI learns patterns from data and is affected by diversity.",
  "AI learns from data and is affected by the data.",
  "AI learns from data and answers with patterns.",
  "AI learns from data and produces answers.",
  "AI learns from data. Data shapes answers.",
  "Data shapes AI answers. Data is important.",
  "Data is important. AI uses data for answers.",
  "Data is important. Data makes answers.",
  "Data matters. Data matters.",
];

const enAnchoredText = [
  "AI learns patterns from human-made data, and source quality and diversity affect the quality of its answers.",
  "AI learns patterns from human-authored data, whose source quality and diversity affect its answers.",
  "AI learns from verified human material, so source quality and diversity remain important.",
  "The quality of AI answers depends partly on the source and diversity of human-authored data.",
  "Because AI learns from human material, preserving original sources and diversity matters.",
  "AI learns from human data, and preserving original sources helps maintain answer quality.",
  "Preserving human source material helps protect the evidence and diversity of AI answers.",
  "Human-authored source material gives AI answers a stable reference for evidence and variety.",
  "Keeping original human material makes it possible to check evidence and expression diversity.",
  "Original human material provides an anchor for checking evidence and diversity in AI answers.",
  "A preserved human anchor helps keep checking the evidence and diversity of AI answers.",
];

const metricSets = {
  ko: {
    recursive: {
      accuracy: [100, 95, 88, 80, 72, 64, 56, 48, 39, 31, 23],
      diversity: [100, 94, 87, 78, 68, 59, 50, 42, 35, 29, 22],
      repetition: [3, 6, 10, 16, 24, 33, 44, 55, 66, 76, 86],
    },
    anchored: {
      accuracy: [100, 99, 98, 98, 97, 96, 96, 95, 95, 94, 94],
      diversity: [100, 99, 98, 97, 97, 96, 95, 95, 94, 94, 93],
      repetition: [3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8],
    },
  },
  en: {
    recursive: {
      accuracy: [100, 96, 91, 85, 79, 73, 67, 61, 55, 48, 41],
      diversity: [100, 96, 91, 85, 79, 72, 65, 58, 51, 44, 37],
      repetition: [3, 5, 8, 12, 17, 23, 30, 38, 47, 57, 68],
    },
    anchored: {
      accuracy: [100, 99, 99, 98, 98, 97, 97, 96, 96, 95, 95],
      diversity: [100, 99, 98, 98, 97, 97, 96, 96, 95, 95, 94],
      repetition: [3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7],
    },
  },
} as const;

export function getLabSeries(language: LabLanguage, condition: LabCondition): LabPoint[] {
  const metrics = metricSets[language][condition];
  const texts = language === "ko"
    ? condition === "recursive" ? koRecursiveText : koAnchoredText
    : condition === "recursive" ? enRecursiveText : enAnchoredText;

  return texts.map((text, generation) => ({
    generation,
    text,
    accuracy: metrics.accuracy[generation],
    diversity: metrics.diversity[generation],
    repetition: metrics.repetition[generation],
  }));
}
