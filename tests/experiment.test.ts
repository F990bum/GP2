import assert from "node:assert/strict";
import test from "node:test";
import {
  getLabSeries,
  getSample,
  MAX_GENERATION,
  nearestSampleGeneration,
  RUNS,
  type LabLanguage,
  type RunId,
} from "../lib/experiment.ts";

const RUN_IDS: RunId[] = ["e1", "e2", "c1"];
const LANGUAGES: LabLanguage[] = ["ko", "en"];

test("every run exposes one point per measured generation", () => {
  assert.equal(MAX_GENERATION, 8);
  assert.deepEqual(RUNS.map((run) => run.id), RUN_IDS);

  for (const run of RUN_IDS) {
    for (const language of LANGUAGES) {
      const series = getLabSeries(run, language);
      assert.equal(series.length, MAX_GENERATION + 1, `${run}/${language} length`);
      series.forEach((point, index) => {
        assert.equal(point.generation, index);
        assert.ok(point.trust >= 0 && point.trust <= 100, `${run}/${language} G${index} trust range`);
        assert.equal(point.collapse, 100 - point.trust);
        assert.ok(point.diversity > 0 && point.diversity <= 100);
      });
    }
  }
});

test("the original generation is the reference point", () => {
  for (const run of RUN_IDS) {
    for (const language of LANGUAGES) {
      const first = getLabSeries(run, language)[0];
      assert.equal(first.trust, 100, `${run}/${language} G0 trust`);
      assert.equal(first.pplRatio, 1);
      assert.equal(first.hangulRetention, 100);
    }
  }
});

test("Korean collapses faster than English when the model relearns its own output", () => {
  const ko = getLabSeries("e1", "ko")[MAX_GENERATION];
  const en = getLabSeries("e1", "en")[MAX_GENERATION];

  assert.ok(ko.trust < en.trust, `ko ${ko.trust} should be below en ${en.trust}`);
  assert.ok(ko.pplRatio > en.pplRatio);
  assert.ok(ko.hangulRetention < 15, `hangul retention ${ko.hangulRetention}%`);
});

test("English-only recursion damages Korean even more than mixed recursion", () => {
  const mixed = getLabSeries("e1", "ko")[MAX_GENERATION];
  const englishOnly = getLabSeries("e2", "ko")[MAX_GENERATION];

  assert.ok(englishOnly.trust <= mixed.trust);
  assert.ok(englishOnly.pplRatio > mixed.pplRatio);
});

test("the human-data control run stays flat across generations", () => {
  for (const language of LANGUAGES) {
    for (const point of getLabSeries("c1", language)) {
      assert.ok(point.trust >= 95, `c1/${language} G${point.generation} trust ${point.trust}`);
    }
  }
  for (const point of getLabSeries("c1", "ko")) {
    assert.ok(point.hangulRetention >= 85, `c1 G${point.generation} hangul ${point.hangulRetention}%`);
  }
});

test("generated samples resolve to the closest published generation", () => {
  assert.equal(nearestSampleGeneration("e1", 0), null);
  assert.equal(getSample("e1", 0), null);
  assert.equal(nearestSampleGeneration("e1", 3), 2);
  assert.equal(nearestSampleGeneration("e1", MAX_GENERATION), 8);
  assert.ok((getSample("e1", 8) ?? "").length > 0);
  assert.equal(nearestSampleGeneration("c1", MAX_GENERATION), null);
});

test("series are cached so repeated reads stay identical", () => {
  assert.equal(getLabSeries("e1", "ko"), getLabSeries("e1", "ko"));
  assert.notEqual(getLabSeries("e1", "ko"), getLabSeries("e1", "en"));
});
