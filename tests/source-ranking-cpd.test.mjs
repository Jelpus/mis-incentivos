import assert from "node:assert/strict";
import xlsx from "xlsx";

import { normalizeKpiLocalYtdRaw } from "../lib/admin/source-ranking/normalize-kpi-local-ytd.ts";

const { utils, write } = xlsx;

const workbook = utils.book_new();
utils.book_append_sheet(
  workbook,
  utils.json_to_sheet([
    {
      ANNIO_MES: "2606",
      "STATUS.TERRITORIO": "MXTEST001",
      "STATUS.NOMBRE": "Representante Prueba",
      TIER_OK: "T1",
      VISITAS_TOT: 10,
      "VISITAS TOP": 8,
      OBJ_OK: 10,
    },
    {
      ANNIO_MES: "2606",
      "STATUS.TERRITORIO": "MXTEST001",
      "STATUS.NOMBRE": "Representante Prueba",
      TIER_OK: "NC",
      VISITAS_TOT: 5,
      "VISITAS TOP": 0,
      OBJ_OK: 0,
    },
  ]),
  "BASE VISITAS",
);
utils.book_append_sheet(workbook, utils.json_to_sheet([]), "CAT_GARANTIA");
utils.book_append_sheet(workbook, utils.json_to_sheet([{ ANNIO_MES: "2606" }]), "CAT CALEN");
utils.book_append_sheet(
  workbook,
  utils.json_to_sheet([
    {
      FECHA: "2606",
      "STATUS.TERRITORIO": "MXTEST001",
      "TFT - DIAS": 2,
    },
  ]),
  "TFT REPORTE",
);

const result = normalizeKpiLocalYtdRaw({
  fileBuffer: write(workbook, { type: "buffer", bookType: "xlsx" }),
  periodMonth: "2026-06-01",
  salesForceRows: [
    {
      territorio_individual: "MXTEST001",
      nombre_completo: "Representante Prueba",
      no_empleado: 12345,
    },
  ],
  diasCicloRows: [
    {
      period: "2606",
      period_month: "2026-06-01",
      dias_ciclo: 20,
    },
  ],
});

assert.equal(result.cpdRows.length, 1);
assert.equal(result.cpdRows[0].visitas, 15, "CPD debe incluir las 5 visitas con TIER_OK = NC");
assert.equal(result.cpdRows[0].dias_efectivos, 18);
assert.equal(result.cpdRows[0].cpd, 0.833333);

console.log("CPD regression test passed: TIER_OK = NC is included.");
