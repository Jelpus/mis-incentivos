import assert from "node:assert/strict";
import test from "node:test";
import { formatStatusImportError, getStatusUniqueConflict } from "../lib/admin/status/import-errors.ts";
import { getImportErrorFeedback } from "../lib/admin/status/get-import-error-feedback.ts";

const duplicateTerritory = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "ux_sales_force_status_period_territorio_individual_active"',
  details: "Key (period_month, territorio_individual)=(2026-10-01, MX-001) already exists.",
};

test("identifica el valor rechazado, las personas, las filas y cómo corregirlo", () => {
  const result = formatStatusImportError(duplicateTerritory, {
    batchId: "lote-1",
    rows: [
      { id: "1", row_number: 12, cleaned_data: { nombre_completo: "Ana", no_empleado: 41, territorio_individual: "MX-001" } },
      { id: "2", row_number: 34, cleaned_data: { nombre_completo: "Luis", territorio_individual: "MX-001" } },
      { id: "3", row_number: 35, cleaned_data: { nombre_completo: "Otra persona", territorio_individual: "MX-002" } },
    ],
    existingRecords: [{ id: "actual", nombre_completo: "Marta", no_empleado: 99 }],
  });
  assert.match(result.message, /territorio individual \(territorio_individual\) «MX-001»/);
  assert.match(result.message, /2026-10/);
  assert.match(result.message, /corrige la asignación/);
  assert.match(result.message, /vuelve a cargar/);
  assert.deepEqual(result.issues, [
    "Excel, fila 12: Ana (empleado 41).",
    "Excel, fila 34: Luis.",
    "Ya registrado en Status: Marta (empleado 99).",
  ]);
  assert.match(result.technicalDetails, /Lote: lote-1/);
  assert.match(result.technicalDetails, /23505/);
  assert.ok(result.technicalDetails.includes(duplicateTerritory.details));
});

test("no inventa nombres ni valores cuando no hay detalle del conflicto", () => {
  const result = formatStatusImportError({ ...duplicateTerritory, details: null }, {
    rows: [{ id: "1", row_number: 3, cleaned_data: { nombre_completo: "Ana", territorio_individual: "MX-001" } }],
  });
  assert.match(result.message, /territorio individual/);
  assert.match(result.message, /no informó los registros/);
  assert.equal(result.issues.length, 0);
  assert.doesNotMatch(result.message, /Ana|MX-001/);
});

test("identifica duplicados de empleado y correo sin confundirlos con territorios", () => {
  for (const [field, value, label] of [["no_empleado", "123", "número de empleado"], ["correo_electronico", "ana@example.com", "correo electrónico"]]) {
    const result = formatStatusImportError({ code: "23505", details: `Key (period_month, ${field})=(2026-10-01, ${value}) already exists.` });
    assert.ok(result.message.includes(label));
    assert.ok(result.message.includes(value));
    assert.doesNotMatch(result.message, /territorio individual/);
  }
});

test("conserva el error real sin interpretar claves ambiguas o compuestas", () => {
  assert.equal(getStatusUniqueConflict({ code: "23505", details: "Key (period_month, team_id, no_empleado)=(2026-10-01, A, 4) already exists." }), null);
  assert.equal(getStatusUniqueConflict({ code: "23505", details: "Key (correo_electronico)=(a,b@example.com) already exists." }), null);
  const result = formatStatusImportError({ code: "XX000", message: "Error no previsto" });
  assert.match(result.message, /soporte/);
  assert.equal(result.technicalDetails, "Código: XX000\nError no previsto");
  assert.doesNotMatch(result.message, /repetido/);
});

test("explica campos obligatorios, formatos, referencias, permisos y conexión", () => {
  const missing = formatStatusImportError({ code: "23502", message: 'null value in column "nombre_completo" of relation "sales_force_status" violates not-null constraint' });
  assert.match(missing.message, /nombre completo/);
  assert.match(missing.message, /Completa/);
  const missingReference = formatStatusImportError({ code: "23503", details: 'Key (team_id)=(EQUIPO-X) is not present in table "teams".' });
  assert.match(missingReference.message, /«EQUIPO-X» de equipo \(team_id\)/);
  for (const [code, expected] of [["22P02", /formato/], ["23503", /registro que no existe/], ["42501", /permisos/], ["57014", /comprueba si el lote figura como aplicado/]]) {
    assert.match(formatStatusImportError({ code }).message, expected);
  }
});

function mockClient({ rows = [], records = [], failTable = null } = {}) {
  const calls = [];
  const supabase = {
    from(table) {
      const call = { table, filters: [], orders: [] };
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq(field, value) { call.filters.push([field, value]); return query; },
        order(field) { call.orders.push(field); return query; },
        async range(from, to) {
          calls.push({ ...call, from, to });
          return table === failTable
            ? { data: null, error: { message: "Lectura fallida" } }
            : { data: (table === "import_rows" ? rows : records).slice(from, to + 1), error: null };
        },
      };
      return query;
    },
  };
  return { supabase, calls };
}

test("consulta todas las filas, incluso si el conflicto está después de la fila 1000", async () => {
  const rows = Array.from({ length: 1005 }, (_, index) => ({ id: String(index), row_number: index + 2, cleaned_data: { nombre_completo: `Persona ${index}`, territorio_individual: `OTRO-${index}` } }));
  rows.push({ id: "conflicto", row_number: 1007, cleaned_data: { nombre_completo: "Luis", territorio_individual: "MX-001" } });
  const { supabase, calls } = mockClient({ rows, records: [{ id: "actual", nombre_completo: "Ana" }] });
  const result = await getImportErrorFeedback({ supabase, error: duplicateTerritory, batchId: "lote-1", importTypeCode: "sales_force_status", periodMonth: "2026-10-01" });
  assert.deepEqual(result.issues, ["Excel, fila 1007: Luis.", "Ya registrado en Status: Ana."]);
  assert.deepEqual(calls.filter((call) => call.table === "import_rows").map((call) => [call.from, call.to]), [[0, 999], [1000, 1999]]);
  for (const call of calls) assert.equal(call.orders.at(-1), "id");
  const statusCall = calls.find((call) => call.table === "sales_force_status");
  assert.deepEqual(statusCall.filters, [["period_month", "2026-10-01"], ["is_deleted", false], ["territorio_individual", "MX-001"]]);
});

test("consulta managers con los campos correspondientes", async () => {
  const error = { code: "23505", details: "Key (period_month, territorio_manager)=(2026-10-01, GER-01) already exists." };
  const { supabase, calls } = mockClient({
    rows: [{ id: "fila", row_number: 8, cleaned_data: { territorio_manager: "GER-01", nombre_manager: "Laura", no_empleado_manager: 123 } }],
    records: [{ id: "actual", nombre_manager: "Pedro", no_empleado_manager: 456 }],
  });
  const result = await getImportErrorFeedback({ supabase, error, batchId: "lote-2", importTypeCode: "manager_status", periodMonth: "2026-10-01" });
  assert.match(result.message, /territorio de manager/);
  assert.deepEqual(result.issues, ["Excel, fila 8: Laura (empleado 123).", "Ya registrado en Status: Pedro (empleado 456)."]);
  assert.ok(calls.some((call) => call.table === "manager_status"));
});

test("un fallo al ampliar el diagnóstico conserva la causa original", async () => {
  const { supabase } = mockClient({ failTable: "sales_force_status" });
  const result = await getImportErrorFeedback({ supabase, error: duplicateTerritory, batchId: "lote-1", importTypeCode: "sales_force_status", periodMonth: "2026-10-01" });
  assert.match(result.message, /MX-001/);
  assert.match(result.technicalDetails, /ux_sales_force_status_period_territorio_individual_active/);
  assert.match(result.issues.join(" "), /No se pudieron consultar/);
});
