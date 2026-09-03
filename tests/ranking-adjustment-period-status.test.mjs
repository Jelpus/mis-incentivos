import assert from "node:assert/strict";
import test from "node:test";

import { isRankingAdjustmentPeriodStatus } from "../lib/admin/ajustes-ranking/period-status.ts";

test("solo permite ajustes en periodos aprobados o publicados", () => {
  assert.equal(isRankingAdjustmentPeriodStatus("final"), true);
  assert.equal(isRankingAdjustmentPeriodStatus("publicado"), true);
  assert.equal(isRankingAdjustmentPeriodStatus(" FINAL "), true);

  assert.equal(isRankingAdjustmentPeriodStatus("precalculo"), false);
  assert.equal(isRankingAdjustmentPeriodStatus("borrador"), false);
  assert.equal(isRankingAdjustmentPeriodStatus(null), false);
});
