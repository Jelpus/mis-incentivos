import assert from "node:assert/strict";
import test from "node:test";
import { previewSalesForceImportBatch } from "../lib/import-engine/preview-sales-force.ts";
import { previewManagerImportBatch } from "../lib/import-engine/preview-manager.ts";
import { getRetiredStatusTerritories, getStatusSnapshotDuplicateIssues } from "../lib/import-engine/status-snapshot.ts";

const salesRow = (territory, name, employee) => ({ linea_principal: "LINEA", parrilla: "PARRILLA", nombre_completo: name,
  territorio_padre: "GER", territorio_individual: territory, no_empleado: employee,
  correo_electronico: employee ? `${employee}@example.test` : "na", base_incentivos: 100, team_id: "TEAM" });

function clientFor({ rows, existing, manager = false }) {
  const updates = [];
  const pages = [];
  let summary;
  const fields = Object.keys(rows[0].raw_data);
  const batch = { id: "batch", period_month: "2026-08-01", mapping_snapshot: Object.fromEntries(fields.map((key) => [key, key])) };
  const db = { from(table) {
    const call = { table, orders: [] };
    const query = {
      select() { return query; },
      eq() { return query; },
      order(field) { call.orders.push(field); return query; },
      async single() { return { data: batch, error: null }; },
      async range(from, to) {
        pages.push({ ...call, from, to });
        return { data: (table === "import_rows" ? rows : existing).slice(from, to + 1), error: null };
      },
      async upsert(data) { updates.push(...data); return { error: null }; },
      update(data) { summary = data.preview_summary; return { async eq() { return { error: null }; } }; },
    };
    assert.ok(["import_batches", "import_rows", manager ? "manager_status" : "sales_force_status"].includes(table));
    return query;
  } };
  return { db, updates, pages, getSummary: () => summary };
}

test("la vista previa relaciona por territorio aunque el empleado estuviera en otra ruta", async () => {
  const rows = [
    { id: "fila-49", row_number: 49, raw_data: salesRow("ANTERIOR", "Vacante", null) },
    { id: "fila-60", row_number: 60, raw_data: salesRow("NUEVA", "Ana", 123) },
  ];
  const mock = clientFor({ rows, existing: [
    { ...salesRow("ANTERIOR", "Ana", 123), id: "anterior", puesto: "Puesto anterior", is_vacant: false, is_active: true },
    { ...salesRow("NUEVA", "Vacante", null), id: "nueva", puesto: "Puesto nueva ruta", is_vacant: true, is_active: true },
    { ...salesRow("RETIRADA", "Otra", 456), id: "retirada", is_vacant: false, is_active: true },
  ] });
  const result = await previewSalesForceImportBatch("batch", mock.db);
  assert.equal(result.invalidRows, 0);
  assert.equal(mock.updates.find((r) => r.row_number === 49).target_record_id, "anterior");
  assert.equal(mock.updates.find((r) => r.row_number === 60).target_record_id, "nueva");
  assert.equal(mock.updates.find((r) => r.row_number === 60).cleaned_data.puesto, "Puesto nueva ruta");
  assert.equal(mock.getSummary().retired_rows, 1);
  assert.equal(mock.getSummary().apply_mode, "full_period");
});

test("los duplicados del archivo se invalidan con nombres y filas", async () => {
  const rows = [
    { id: "1", row_number: 2, raw_data: salesRow("A", "Ana", 123) },
    { id: "2", row_number: 9, raw_data: salesRow("A", "Bea", 456) },
  ];
  const mock = clientFor({ rows, existing: [] });
  const result = await previewSalesForceImportBatch("batch", mock.db);
  assert.equal(result.invalidRows, 2);
  assert.equal(result.validRows, 0);
  assert.equal(result.insertRows, 0);
  assert.match(mock.updates[0].validation_errors.at(-1).message, /Ana \(fila 2\), Bea \(fila 9\)/);
});

test("los managers existentes y las rutas ausentes se consultan con paginación", async () => {
  const existing = Array.from({ length: 1005 }, (_, i) => ({ id: String(i), territorio_manager: `GER-${i}`, nombre_manager: "Vacante", correo_manager: null, no_empleado_manager: null, team_id: null, is_active: true, is_vacant: true }));
  const mock = clientFor({ manager: true, existing, rows: [{ id: "fila", row_number: 2, raw_data: { territorio_manager: "GER-1004", nombre_manager: "Vacante", correo_manager: null, no_empleado_manager: null, is_vacant: true } }] });
  const result = await previewManagerImportBatch("batch", mock.db);
  assert.equal(result.noopRows, 1);
  assert.equal(mock.updates[0].target_record_id, "1004");
  assert.equal(mock.getSummary().retired_rows, 1004);
  assert.deepEqual(mock.pages.filter((p) => p.table === "manager_status").map((p) => p.from), [0, 1000]);
  for (const page of mock.pages) assert.equal(page.orders.at(-1), "id");
});

test("los empleados duplicados se validan sin tratar las vacantes como un empleado", () => {
  const rows = [
    { id: "1", row_number: 2, cleaned_data: salesRow("A", "Ana", 123) },
    { id: "2", row_number: 3, cleaned_data: salesRow("B", "Bea", 123) },
    { id: "3", row_number: 4, cleaned_data: salesRow("C", "Vacante", null) },
    { id: "4", row_number: 5, cleaned_data: salesRow("D", "Vacante", null) },
  ];
  const issues = getStatusSnapshotDuplicateIssues(rows, "sales_force_status");
  assert.equal(issues.size, 2);
  assert.equal(issues.get("1")[0].field, "no_empleado");
  assert.equal(getRetiredStatusTerritories(rows, [{ id: "keep", territorio_individual: "A" }, { id: "remove", territorio_individual: "Z" }], "sales_force_status")[0].id, "remove");
});
