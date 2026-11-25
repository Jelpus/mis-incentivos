import assert from "node:assert/strict";
import { test } from "node:test";
import xlsx from "xlsx";
import { normalizeCertifications, parseCertificationPercentage } from "../lib/admin/source-ranking/normalize-certifications.ts";
import { loadAnnualCertificationsData, loadCertificationStatus } from "../lib/admin/source-ranking/certifications-data.ts";
import { createAnnualCertificationLoader } from "../lib/ranking-contests/annual-certifications.ts";
import { evaluateContestComponent, resolveQualification } from "../lib/ranking-contests/qualification.ts";

const headers = ["NO.EMPLEADO", "TERRITORIO", "Sales Rep", "Conocimiento científico", "% Acreditación"];
function file(rows, columns = headers, preamble = []) {
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([...preamble, columns, ...rows]), "Oficial");
  return xlsx.write(book, { type: "buffer", bookType: "xlsx" });
}
const status = (id = 1, route = "MX01", extras = {}) => ({ no_empleado: id, territorio_individual: route, nombre_completo: `Persona ${id}`, is_vacant: false, ...extras });
const normalize = (rows, statusRows = [status()]) => normalizeCertifications({ fileBuffer: file(rows), statusRows });

test("lee las dos columnas, porcentajes Excel y valores N/A sin convertirlos a cero", () => {
  const result = normalize([[1, "MX01", "Persona", .95, .8], [null, "MX02", "Persona 2", "N/A", null]], [status(), status(2, "MX02")]);
  assert.equal(result.rows[0].scientific_knowledge_pct, 95);
  assert.equal(result.rows[0].annual_certification_pct, 80);
  assert.equal(result.rows[1].matched_by, "territory");
  assert.equal(result.rows[1].annual_certification_pct, null);
  assert.equal(result.summary.missingScoreRows, 1);
  assert.equal(parseCertificationPercentage(0, "test"), 0);
  assert.equal(parseCertificationPercentage("80,5%", "test"), 80.5);
  assert.equal(parseCertificationPercentage("1%", "test"), 1);
  assert.equal(parseCertificationPercentage(1, "test"), 100);
});

test("tolera acentos, espacios y filas introductorias; conserva la fila Excel real", () => {
  const result = normalizeCertifications({ fileBuffer: file([[1, "MX01", "Persona", 1, .8]], [" No. Empleado ", "Territorio", "Sales Rep", "Conocimiento cientifico", "% Acreditacion"], [["Informe anual"], []]), statusRows: [status()] });
  assert.equal(result.rows[0].source_row, 4);
  assert.equal(result.rows[0].scientific_knowledge_pct, 100);
});

test("rechaza cabeceras ausentes, columnas duplicadas y porcentajes inválidos", () => {
  assert.throws(() => normalizeCertifications({ fileBuffer: file([], ["Nombre"]), statusRows: [] }), /Faltan columnas/);
  assert.throws(() => normalizeCertifications({ fileBuffer: file([], [...headers, "% Acreditacion"]), statusRows: [] }), /duplicada/);
  for (const score of [-1, 101, "abc", "Infinity"]) assert.throws(() => parseCertificationPercentage(score, "Fila 2"), /Fila 2/);
});

test("empleados repetidos se conservan como conflicto incluso si ocupan rutas diferentes", () => {
  const result = normalize([[1, "MX01", "Uno", 1, .8], [1, "MX02", "Otro", 1, .9]], [status(), status(2, "MX02")]);
  assert.equal(result.summary.conflictRows, 2);
  assert.ok(result.rows.every((r) => r.matched_employee === null));
});

test("no asigna una nota a otro empleado porque ocupa ahora su ruta", () => {
  const result = normalize([[1, "MX02", "Uno", 1, .8]], [status(), status(2, "MX02")]);
  assert.equal(result.rows[0].matched_by, "conflict");
  assert.equal(normalize([[77, "MX01", "Otro", 1, .8]]).rows[0].matched_by, "unmatched");
});

test("prioriza el empleado cuando la ruta histórica ya no está en Status y no usa nombres", () => {
  const row = normalize([[1, "ANTIGUA", "Nombre totalmente distinto", 1, .8]]).rows[0];
  assert.equal(row.matched_by, "employee");
  assert.equal(row.matched_employee, 1);
  assert.equal(row.source_territory, "ANTIGUA");
  assert.match(row.match_issue, /difiere/);
});

test("una vacante de Status no recibe calificaciones por territorio", () => {
  assert.equal(normalize([["NA", "MX01", "Uno", 1, .8]], [status(1, "MX01", { is_vacant: true })]).rows[0].matched_by, "unmatched");
});

class Query {
  constructor(db, table) { this.db = db; this.table = table; this.filters = []; this.sorts = []; this.bound = null; this.single = false; this.head = false; }
  select(_columns, options) { this.head = options?.head; return this; }
  eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
  gte(k, v) { this.filters.push((r) => r[k] >= v); return this; }
  lte(k, v) { this.filters.push((r) => r[k] <= v); return this; }
  lt(k, v) { this.filters.push((r) => r[k] < v); return this; }
  ilike(k, v) { this.filters.push((r) => String(r[k]).toUpperCase() === String(v).toUpperCase()); return this; }
  order(k, options) { this.sorts.push([k, options?.ascending !== false]); return this; }
  range(f, t) { this.bound = [f, t]; return this; }
  limit(n) { this.bound = [0, n - 1]; return this; }
  maybeSingle() { this.single = true; return this; }
  then(resolve, reject) {
    this.db.calls.push({ table: this.table, range: this.bound, single: this.single, sorts: this.sorts });
    assert.ok(this.bound || this.head, `Consulta sin paginar: ${this.table}`);
    assert.equal(this.sorts.at(-1)?.[0], "id");
    if (this.db.errors[this.table]) return Promise.resolve({ data: null, error: { message: "lectura fallida" } }).then(resolve, reject);
    let rows = (this.db.tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
    rows.sort((a, b) => { for (const [k, asc] of this.sorts) { if (a[k] !== b[k]) return (a[k] < b[k] ? -1 : 1) * (asc ? 1 : -1); } return 0; });
    const count = rows.length;
    if (this.bound) rows = rows.slice(this.bound[0], this.bound[1] + 1);
    return Promise.resolve({ data: this.single ? rows[0] ?? null : rows, count, error: null }).then(resolve, reject);
  }
}
function database(tables = {}, errors = {}) {
  return { tables, errors, calls: [], from(table) { return new Query(this, table); } };
}
const row = (id = 1, score = 80, extras = {}) => ({ id: `r${String(id).padStart(5, "0")}`, version_id: "v2", source_row: id + 1, source_employee: id, source_territory: `MX${id}`, source_name: `Persona ${id}`, matched_employee: id, matched_territory: `MX${id}`, matched_name: `Persona ${id}`, matched_by: "employee", match_issue: null, scientific_knowledge_pct: 95, annual_certification_pct: score, ...extras });
const versions = [{ id: "v1", certification_year: 2026, version_no: 1 }, { id: "v2", certification_year: 2026, version_no: 2 }, { id: "old", certification_year: 2025, version_no: 5 }];
const baseParams = {
  component: { id: "c1", contestId: "c", componentName: "Certificación anual", thresholdValue: 80, periodStart: "2026-01-01", periodEnd: "2026-11-01", isActive: true, sortOrder: 0 },
  participant: { id: "rep1", scope: "rep", employeeNumber: 1, territory: "MX1", name: "Persona 1", raw: {} },
  contest: { id: "c", coveragePeriodStart: "2026-01-01" },
  maxCoveragePeriodMonth: "2026-09-01",
  exclusionSnapshot: { versionNo: null, byTerritory: new Map(), error: null },
};
const evaluate = (sb, overrides = {}) => evaluateContestComponent({ ...baseParams, supabase: sb, ...overrides });

test("usa únicamente la última versión del año y evalúa ambas columnas contra sus umbrales", async () => {
  const sb = database({ ranking_certification_versions: versions, ranking_certification_rows: [row(), row(1, 10, { id: "oldrow", version_id: "v1" })] });
  const loadAnnualSnapshot = createAnnualCertificationLoader(sb);
  const cert = await evaluate(sb, { loadAnnualSnapshot });
  const scientific = await evaluate(sb, { loadAnnualSnapshot, component: { ...baseParams.component, componentName: "Conocimiento  científico", thresholdValue: 90 } });
  assert.equal(cert.value, 80); assert.equal(cert.status, "passed"); assert.match(cert.reason, /versión 2/);
  assert.equal(scientific.value, 95); assert.equal(scientific.status, "passed");
  assert.equal(sb.calls.filter((c) => c.table === "ranking_certification_versions").length, 1);
  assert.equal(sb.calls.filter((c) => c.table === "ranking_certification_rows").length, 1);
});

test("no reutiliza otro año, no suma meses y no aplica exclusiones mensuales a las notas anuales", async () => {
  const sb = database({ ranking_certification_versions: versions, ranking_certification_rows: [row()] });
  const a = await evaluate(sb, { maxCoveragePeriodMonth: "2026-11-01", exclusionSnapshot: { error: null, versionNo: 3, byTerritory: new Map([["MX1", new Set(["2026-11-01"])]]) } });
  assert.equal(a.value, 80);
  const b = await evaluate(sb, { component: { ...baseParams.component, periodStart: "2027-01-01", periodEnd: "2027-11-01" }, maxCoveragePeriodMonth: "2027-09-01" });
  assert.equal(b.status, "pending"); assert.match(b.reason, /2027/);
});

test("una nota baja falla sin aprobar por el redondeo de pantalla", async () => {
  const sb = database({ ranking_certification_versions: versions, ranking_certification_rows: [row(1, 79.999)] });
  const result = await evaluate(sb);
  assert.equal(result.value, 80); assert.equal(result.status, "failed"); assert.equal(result.passed, false);
});

test("N/A, conflictos, duplicados y errores de lectura quedan pendientes, sin aprobación automática", async () => {
  for (const scores of [[row(1, null)], [row(1, 80, { matched_by: "conflict", matched_employee: null })], [row(), row(1, 90, { id: "duplicate" })], []]) {
    const result = await evaluate(database({ ranking_certification_versions: versions, ranking_certification_rows: scores }));
    assert.equal(result.status, "pending"); assert.equal(result.passed, false);
    assert.equal(resolveQualification([result]).qualificationStatus, "pending");
  }
  const failedRead = await evaluate(database({ ranking_certification_versions: versions }, { ranking_certification_rows: true }));
  assert.equal(failedRead.status, "pending");
  const zero = await evaluate(database({ ranking_certification_versions: versions, ranking_certification_rows: [row(1, 0)] }));
  assert.equal(zero.value, 0); assert.equal(zero.status, "failed");
});

test("el promedio de manager incluye más de 1000 miembros y notas de todas las páginas", async () => {
  const scores = Array.from({ length: 1005 }, (_, i) => row(i + 1, i === 1004 ? 0 : 100));
  const members = scores.map((r, i) => ({ id: `s${String(i).padStart(5, "0")}`, period_month: "2026-09-01", no_empleado: r.matched_employee, territorio_individual: r.matched_territory, territorio_padre: "MANAGER", is_active: true, is_deleted: false, is_vacant: false }));
  const sb = database({ ranking_certification_versions: versions, ranking_certification_rows: scores, sales_force_status: members });
  const manager = { ...baseParams.participant, id: "manager", scope: "manager", territory: "MANAGER" };
  const result = await evaluate(sb, { participant: manager, component: { ...baseParams.component, componentName: "Promedio del equipo certificación anual", thresholdValue: 100 } });
  assert.equal(result.value, 99.9); assert.equal(result.status, "failed"); assert.match(result.reason, /1005 personas/);
  for (const table of ["ranking_certification_rows", "sales_force_status"]) assert.ok(sb.calls.some((c) => c.table === table && c.range[0] === 1000));
});

test("un miembro sin nota mantiene pendiente al manager; la vinculación por ruta no cambia de persona", async () => {
  const member = { id: "s", period_month: "2026-09-01", no_empleado: 2, territorio_individual: "MX1", territorio_padre: "MANAGER", is_active: true, is_deleted: false, is_vacant: false };
  const result = await evaluate(database({ ranking_certification_versions: versions, ranking_certification_rows: [row()], sales_force_status: [member] }), { participant: { ...baseParams.participant, scope: "manager", territory: "MANAGER" } });
  assert.equal(result.status, "pending");
});

test("un participante sin claves no recibe la única nota que tiene territorio vacío", async () => {
  const sb = database({ ranking_certification_versions: versions, ranking_certification_rows: [row(2, 100, { matched_territory: null })] });
  const result = await evaluate(sb, { participant: { ...baseParams.participant, employeeNumber: null, territory: null } });
  assert.equal(result.status, "pending");
  assert.match(result.reason, /no tiene empleado ni territorio/);
});

test("el bloque anual y su Status leen todas las versiones y filas, sin truncar en 1000", async () => {
  const manyVersions = Array.from({ length: 1001 }, (_, i) => ({ id: `v${i}`, version_no: i + 1, certification_year: 2026 }));
  const scores = Array.from({ length: 1005 }, (_, i) => row(i + 1, 80, { version_id: "v1000" }));
  const members = scores.map((r) => ({ ...status(r.matched_employee, r.matched_territory), id: r.id, is_active: true, is_deleted: false, period_month: "2026-09-01" }));
  const sb = database({ ranking_certification_versions: manyVersions, ranking_certification_rows: scores, sales_force_status: members });
  const data = await loadAnnualCertificationsData(sb, 2026);
  assert.equal(data.error, null); assert.equal(data.versions.length, 1001); assert.equal(data.rows.length, 1005);
  const loaded = await loadCertificationStatus(sb, 2026);
  assert.equal(loaded.rows.length, 1005);
});
