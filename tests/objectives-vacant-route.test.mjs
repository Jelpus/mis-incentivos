import assert from "node:assert/strict";
import test from "node:test";

const { computeObjectivesPreview } = await import("../lib/admin/objetivos/import-objectives.ts");
const { isHiredAfterPeriod } = await import("../lib/admin/calculo/member-eligibility.ts");

function previewFor(statusRows) {
  return computeObjectivesPreview({
    selectedPeriodMonth: "2026-07-01",
    parsedInput: {
      sheetName: "private:FY2026",
      totalRowsRead: 1,
      skippedByPeriod: 0,
      invalidRows: [],
      sourceBreakdown: [],
      rowsForPeriod: [{
        rowNumber: 43,
        sourceType: "private",
        sourceFileName: "cuotas-julio.xlsx",
        sourceSheetName: "FY2026",
        periodMonth: "2026-07-01",
        territorioIndividual: "MXPCRM2112M2",
        productName: "SYBRAVA_PRIVATE",
        metodo: "PRIVATE",
        planTypeName: "SALES VS TARGET",
        target: 37.15,
        brick: "PRIVATE",
        cuenta: "PRIVATE",
        canal: null,
        producto: null,
        periodoString: "202607",
        periodo: "2607",
        salesCredity: 1,
      }],
    },
    statusRows,
    ruleVersionRows: [{ team_id: "SYBP", version_no: 1, created_at: "2026-09-30", rule_definition_id: "rule-sybp" }],
    ruleItemRows: [{ definition_id: "rule-sybp", product_name: "SYBRAVA_PRIVATE", plan_type_name: "SALES VS TARGET" }],
  });
}

test("conserva la cuota de julio aunque el territorio figure vacante", () => {
  const result = previewFor([{
    territorio_individual: "MXPCRM2112M2",
    team_id: "SYBP",
    is_active: true,
    is_vacant: true,
  }]);

  assert.equal(result.summary.validRows, 1);
  assert.equal(result.summary.vacantTargetRows, 1);
  assert.equal(result.summary.warningCount, 0);
  assert.equal(result.summary.missingRequiredCount, 0);
  assert.equal(result.validRowsForInsert[0].teamId, "SYBP");
});

test("mantiene visible el error si la ruta no existe en Status", () => {
  const result = previewFor([]);
  assert.equal(result.summary.validRows, 0);
  assert.equal(result.summary.invalidRows, 1);
  assert.equal(result.summary.invalidDetails[0].code, "unknown_route");
});

test("valida la ruta aunque aparezca despues de mil filas del Status", () => {
  const statusRows = Array.from({ length: 1_050 }, (_, index) => ({
    territorio_individual: `RUTA-${index}`,
    team_id: "SYBP",
    is_active: true,
    is_vacant: true,
  }));
  statusRows.push({
    territorio_individual: "MXPCRM2112M2",
    team_id: "SYBP",
    is_active: true,
    is_vacant: true,
  });
  const result = previewFor(statusRows);
  assert.equal(result.summary.validRows, 1);
  assert.equal(result.validRowsForInsert[0].territorioIndividual, "MXPCRM2112M2");
});

test("no calcula julio para una persona contratada en septiembre", () => {
  assert.equal(isHiredAfterPeriod("2026-09-07", "2026-07-01"), true);
  assert.equal(isHiredAfterPeriod("2026-07-31", "2026-07-01"), false);
  assert.equal(isHiredAfterPeriod(null, "2026-07-01"), false);
});
