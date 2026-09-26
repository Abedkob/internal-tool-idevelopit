import assert from "node:assert/strict";
import test from "node:test";
import {
  activityDateRange,
  parsePipelineActivity,
  parsePipelineOwner,
  parsePipelinePage,
  sanitizeContactSearch,
} from "./pipeline.ts";

const NOW = new Date("2026-09-26T12:00:00.000Z");

test("pipeline activity ranges match the heat boundaries", () => {
  assert.deepEqual(activityDateRange("fresh", NOW), {
    afterExclusive: "2026-09-22T12:00:00.000Z",
  });
  assert.deepEqual(activityDateRange("watch", NOW), {
    afterExclusive: "2026-09-18T12:00:00.000Z",
    beforeInclusive: "2026-09-22T12:00:00.000Z",
  });
  assert.deepEqual(activityDateRange("warm", NOW), {
    afterExclusive: "2026-09-11T12:00:00.000Z",
    beforeInclusive: "2026-09-18T12:00:00.000Z",
  });
  assert.deepEqual(activityDateRange("hot", NOW), {
    beforeInclusive: "2026-09-11T12:00:00.000Z",
  });
});

test("pipeline URL values recover to safe defaults", () => {
  assert.equal(parsePipelinePage("3.9"), 3);
  assert.equal(parsePipelinePage("0"), 1);
  assert.equal(parsePipelinePage("not-a-page"), 1);
  assert.equal(parsePipelineActivity("warm"), "warm");
  assert.equal(parsePipelineActivity("today"), "all");
  assert.equal(parsePipelineOwner("unassigned"), "unassigned");
  assert.equal(
    parsePipelineOwner("165c95b8-5313-4e45-8be7-e413d1bec495"),
    "165c95b8-5313-4e45-8be7-e413d1bec495",
  );
  assert.equal(parsePipelineOwner("not-a-uuid"), "all");
});

test("contact search is sanitized and capped", () => {
  assert.equal(
    sanitizeContactSearch('  jo%n_, (doe) "beirut"  '),
    "jo n doe beirut",
  );
  assert.equal(sanitizeContactSearch("a".repeat(120)).length, 100);
});
