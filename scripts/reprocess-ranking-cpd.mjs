import fs from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { normalizeKpiLocalYtdRaw } from "../lib/admin/source-ranking/normalize-kpi-local-ytd.ts";

const applyChanges = process.argv.includes("--apply");
const sourcePeriodArg = process.argv.find((arg) => arg.startsWith("--source-period="));
const sourcePeriod = sourcePeriodArg?.split("=", 2)[1] ?? null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function rowKey(row) {
  return [
    String(row.period_month ?? ""),
    String(row.territorio_individual ?? "").trim().toUpperCase(),
    row.empleado == null ? "na" : String(row.empleado),
  ].join("|");
}

function numberValue(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDifferent(previous, next) {
  return ["dias_ciclo", "tft", "dias_efectivos", "visitas", "cpd"].some(
    (field) => Math.abs(numberValue(previous[field]) - numberValue(next[field])) > 0.000001,
  ) || String(previous.nombre ?? "") !== String(next.nombre ?? "");
}

async function insertInBatches(rows) {
  const batchSize = 500;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const result = await supabase.from("ranking_cpd_raw").insert(batch);
    if (result.error) throw result.error;
  }
}

async function loadStatusRows(periodMonth) {
  let selectedPeriod = periodMonth;
  let result = await supabase
    .from("sales_force_status")
    .select("territorio_individual,nombre_completo,no_empleado")
    .eq("period_month", selectedPeriod)
    .eq("is_deleted", false)
    .eq("is_active", true)
    .eq("is_vacant", false);
  if (result.error) throw result.error;
  if ((result.data ?? []).length > 0) return { periodMonth: selectedPeriod, rows: result.data };

  const latest = await supabase
    .from("sales_force_status")
    .select("period_month")
    .lte("period_month", periodMonth)
    .eq("is_deleted", false)
    .order("period_month", { ascending: false })
    .limit(1);
  if (latest.error) throw latest.error;
  selectedPeriod = String(latest.data?.[0]?.period_month ?? "");
  if (!selectedPeriod) return { periodMonth, rows: [] };

  result = await supabase
    .from("sales_force_status")
    .select("territorio_individual,nombre_completo,no_empleado")
    .eq("period_month", selectedPeriod)
    .eq("is_deleted", false)
    .eq("is_active", true)
    .eq("is_vacant", false);
  if (result.error) throw result.error;
  return { periodMonth: selectedPeriod, rows: result.data ?? [] };
}

let sourceQuery = supabase
  .from("ranking_source_files")
  .select("period_month,original_file_name,storage_bucket,storage_path,uploaded_at")
  .eq("file_code", "kpi_local_ytd")
  .order("period_month", { ascending: false })
  .limit(1);
if (sourcePeriod) sourceQuery = sourceQuery.eq("period_month", sourcePeriod);

const sourceResult = await sourceQuery;
if (sourceResult.error) throw sourceResult.error;
const source = sourceResult.data?.[0];
if (!source) throw new Error("No se encontró un archivo KPI Local YTD para reprocesar.");

console.log(`Fuente: ${source.original_file_name} (${source.period_month})`);
console.log(`Modo: ${applyChanges ? "APLICAR" : "DRY-RUN"}`);

const downloadResult = await supabase.storage
  .from(String(source.storage_bucket))
  .download(String(source.storage_path));
if (downloadResult.error) throw downloadResult.error;
const fileBuffer = Buffer.from(await downloadResult.data.arrayBuffer());
console.log(`Archivo descargado: ${fileBuffer.length} bytes`);

const [status, diasCicloResult] = await Promise.all([
  loadStatusRows(String(source.period_month)),
  supabase.from("dias_ciclo").select("period,period_month,dias_ciclo"),
]);
if (diasCicloResult.error) throw diasCicloResult.error;

const normalized = normalizeKpiLocalYtdRaw({
  fileBuffer,
  periodMonth: String(source.period_month),
  salesForceRows: status.rows,
  diasCicloRows: diasCicloResult.data ?? [],
});
const nextRows = normalized.cpdRows;
const targetPeriods = [...new Set(nextRows.map((row) => row.period_month))].sort();
if (targetPeriods.length === 0) throw new Error("La normalización no produjo períodos de CPD.");

const currentResult = await supabase
  .from("ranking_cpd_raw")
  .select("period_month,territorio_individual,empleado,nombre,dias_ciclo,tft,dias_efectivos,visitas,cpd")
  .in("period_month", targetPeriods);
if (currentResult.error) throw currentResult.error;
const currentRows = currentResult.data ?? [];

const previousByKey = new Map(currentRows.map((row) => [rowKey(row), row]));
const nextByKey = new Map(nextRows.map((row) => [rowKey(row), row]));
const changed = [];
let added = 0;
let unchanged = 0;
for (const row of nextRows) {
  const previous = previousByKey.get(rowKey(row));
  if (!previous) {
    added += 1;
    changed.push({ row, previous: null, visitasDelta: numberValue(row.visitas) });
  } else if (isDifferent(previous, row)) {
    changed.push({
      row,
      previous,
      visitasDelta: numberValue(row.visitas) - numberValue(previous.visitas),
    });
  } else {
    unchanged += 1;
  }
}
const removed = currentRows.filter((row) => !nextByKey.has(rowKey(row)));

const previousVisits = currentRows.reduce((sum, row) => sum + numberValue(row.visitas), 0);
const nextVisits = nextRows.reduce((sum, row) => sum + numberValue(row.visitas), 0);
console.log(JSON.stringify({
  statusPeriod: status.periodMonth,
  targetPeriods,
  currentRows: currentRows.length,
  nextRows: nextRows.length,
  changedRows: changed.length,
  addedRows: added,
  removedRows: removed.length,
  unchangedRows: unchanged,
  previousVisits,
  nextVisits,
  visitsAddedByRule: nextVisits - previousVisits,
  preview: changed
    .sort((a, b) => Math.abs(b.visitasDelta) - Math.abs(a.visitasDelta))
    .slice(0, 15)
    .map(({ row, previous, visitasDelta }) => ({
      periodMonth: row.period_month,
      territory: row.territorio_individual,
      employee: row.empleado,
      previousVisits: previous ? numberValue(previous.visitas) : null,
      nextVisits: numberValue(row.visitas),
      visitasDelta,
      previousCpd: previous ? numberValue(previous.cpd) : null,
      nextCpd: numberValue(row.cpd),
    })),
}, null, 2));

if (!applyChanges) {
  console.log("Dry-run completo. Usa --apply para reemplazar ranking_cpd_raw.");
  process.exit(0);
}

const outputDir = path.resolve("outputs", "ranking-validation-audit");
await fs.mkdir(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(outputDir, `cpd-reprocess-backup-${stamp}.json`);
await fs.writeFile(backupPath, JSON.stringify({
  createdAt: new Date().toISOString(),
  source,
  targetPeriods,
  rows: currentRows,
}, null, 2));
console.log(`Backup: ${backupPath}`);

try {
  const deleteResult = await supabase
    .from("ranking_cpd_raw")
    .delete()
    .in("period_month", targetPeriods);
  if (deleteResult.error) throw deleteResult.error;
  await insertInBatches(nextRows);
} catch (error) {
  console.error("Falló el reproceso; intentando restaurar el backup.");
  const cleanupResult = await supabase
    .from("ranking_cpd_raw")
    .delete()
    .in("period_month", targetPeriods);
  if (cleanupResult.error) throw new AggregateError([error, cleanupResult.error], "Falló reproceso y limpieza para restauración.");
  await insertInBatches(currentRows);
  throw error;
}

const verifyResult = await supabase
  .from("ranking_cpd_raw")
  .select("period_month,visitas")
  .in("period_month", targetPeriods);
if (verifyResult.error) throw verifyResult.error;
const verifiedRows = verifyResult.data ?? [];
const verifiedVisits = verifiedRows.reduce((sum, row) => sum + numberValue(row.visitas), 0);
if (verifiedRows.length !== nextRows.length || Math.abs(verifiedVisits - nextVisits) > 0.000001) {
  throw new Error(`Verificación fallida: filas ${verifiedRows.length}/${nextRows.length}, visitas ${verifiedVisits}/${nextVisits}.`);
}

console.log(`Reproceso aplicado y verificado: ${verifiedRows.length} filas, ${verifiedVisits} visitas.`);
