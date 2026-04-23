"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import {
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";

type ActionState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

type UploadGarantiasBatchResult =
  | {
      ok: true;
      message: string;
      processedRows: number;
      createdRows: number;
      duplicatedRows: number;
      invalidRows: number;
      sampleErrors: string[];
    }
  | {
      ok: false;
      message: string;
      sampleErrors?: string[];
    }
  | null;

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

function normalizeScopeValue(value: string, scopeType: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (scopeType === "linea" || scopeType === "team_id" || scopeType === "representante") {
    return raw.toUpperCase();
  }
  return raw;
}

function parseRuleKeysInput(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .map((item) => String(item ?? "").trim())
          .filter((item) => item.length > 0),
      ),
    );
  } catch {
    return [];
  }
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getCellString(
  row: Record<string, unknown>,
  normalizedHeaderMap: Map<string, string>,
  candidates: string[],
): string {
  for (const candidate of candidates) {
    const key = normalizedHeaderMap.get(normalizeHeader(candidate));
    if (!key) continue;
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function parseBooleanLike(value: string | null | undefined, fallback: boolean): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;
  if (["true", "1", "si", "sí", "yes", "y", "activo", "activa"].includes(text)) return true;
  if (["false", "0", "no", "n", "inactivo", "inactiva"].includes(text)) return false;
  return fallback;
}

function toMonthStart(year: number, month: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;
  return `${String(Math.trunc(year)).padStart(4, "0")}-${String(Math.trunc(month)).padStart(2, "0")}-01`;
}

function parseGuaranteeMonthInput(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized = normalizePeriodMonthInput(raw);
  if (normalized) {
    return `${normalized.slice(0, 7)}-01`;
  }

  // Excel serial date
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (Number.isFinite(serial) && serial >= 1 && serial <= 100000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(excelEpoch.getTime() + Math.floor(serial) * 86400000);
      return toMonthStart(date.getUTCFullYear(), date.getUTCMonth() + 1);
    }
  }

  // MM/YYYY or M/YYYY
  let match = raw.match(/^(\d{1,2})[\/.-](\d{4})$/);
  if (match) {
    const month = Number(match[1]);
    const year = Number(match[2]);
    return toMonthStart(year, month);
  }

  // DD/MM/YYYY or MM/DD/YYYY (if ambiguous, prefer MM/DD for historical Excel defaults)
  match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]);

    if (first > 12 && second >= 1 && second <= 12) {
      // DD/MM/YYYY
      return toMonthStart(year, second);
    }
    if (second > 12 && first >= 1 && first <= 12) {
      // MM/DD/YYYY
      return toMonthStart(year, first);
    }
    // Ambiguous: assume month/day
    return toMonthStart(year, first);
  }

  // Month names in Spanish/English (e.g. Ene-2026, Jan 2026)
  const monthTokenMap: Record<string, number> = {
    ene: 1, enero: 1, jan: 1, january: 1,
    feb: 2, febrero: 2, february: 2,
    mar: 3, marzo: 3, march: 3,
    abr: 4, abril: 4, apr: 4, april: 4,
    may: 5, mayo: 5,
    jun: 6, junio: 6, june: 6,
    jul: 7, julio: 7, july: 7,
    ago: 8, agosto: 8, aug: 8, august: 8,
    sep: 9, sept: 9, septiembre: 9, september: 9,
    oct: 10, octubre: 10, october: 10,
    nov: 11, noviembre: 11, november: 11,
    dic: 12, diciembre: 12, dec: 12, december: 12,
  };
  const normalizedWords = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  match = normalizedWords.match(/^([a-z]+)[\s\/.-](\d{2,4})$/);
  if (match) {
    const token = match[1];
    const month = monthTokenMap[token];
    const yearRaw = Number(match[2]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    if (month) return toMonthStart(year, month);
  }

  // Final fallback for Date-like strings
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return toMonthStart(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1);
  }

  return null;
}

function parseEmployeeNumber(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function parseTargetCoverage(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return 100;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 10000) / 10000;
}

function parseGuaranteePaymentPreference(
  value: string | null | undefined,
): "max_pay" | "prefer_real" | "prefer_guaranteed" | null {
  const raw = String(value ?? "").trim();
  if (!raw) return "max_pay";
  if (raw === "max_pay" || raw === "prefer_real" || raw === "prefer_guaranteed") {
    return raw;
  }
  return null;
}

export async function createGarantiaAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const guaranteeStartInput = String(formData.get("guarantee_start_month") ?? "").trim();
  const guaranteeEndInput = String(formData.get("guarantee_end_month") ?? "").trim();
  const scopeType = String(formData.get("scope_type") ?? "").trim();
  const scopeValueInput = String(formData.get("scope_value") ?? "").trim();
  const scopeLabel = String(formData.get("scope_label") ?? "").trim();
  const ruleScope = String(formData.get("rule_scope") ?? "").trim();
  const ruleKeyInput = String(formData.get("rule_key") ?? "").trim();
  const ruleKeysInput = String(formData.get("rule_keys") ?? "").trim();
  const targetCoverageInput = String(formData.get("target_coverage") ?? "").trim();
  const guaranteePaymentPreferenceInput = String(
    formData.get("guarantee_payment_preference") ?? "",
  ).trim();
  const note = String(formData.get("note") ?? "").trim();

  const guaranteeStartMonth = normalizePeriodMonthInput(guaranteeStartInput);
  if (!guaranteeStartMonth) {
    return { ok: false, message: "Inicio de garantia invalido. Usa formato YYYY-MM." };
  }

  const guaranteeEndMonth = normalizePeriodMonthInput(guaranteeEndInput);
  if (!guaranteeEndMonth) {
    return { ok: false, message: "Fin de garantia invalido. Usa formato YYYY-MM." };
  }

  if (guaranteeEndMonth < guaranteeStartMonth) {
    return { ok: false, message: "El fin de garantia no puede ser menor al inicio." };
  }

  if (!["linea", "team_id", "representante"].includes(scopeType)) {
    return { ok: false, message: "scope_type invalido." };
  }

  const scopeValue = normalizeScopeValue(scopeValueInput, scopeType);
  if (!scopeValue) {
    return { ok: false, message: "Debes seleccionar el valor del alcance." };
  }

  if (!["all_rules", "single_rule"].includes(ruleScope)) {
    return { ok: false, message: "rule_scope invalido." };
  }

  const parsedRuleKeys = parseRuleKeysInput(ruleKeysInput);
  const fallbackRuleKey = ruleKeyInput.trim();
  const ruleKeys =
    ruleScope === "single_rule"
      ? (parsedRuleKeys.length ? parsedRuleKeys : fallbackRuleKey ? [fallbackRuleKey] : [])
      : [];

  if (ruleScope === "single_rule" && ruleKeys.length === 0) {
    return { ok: false, message: "Debes seleccionar o escribir una regla puntual." };
  }

  const targetCoverage = parseTargetCoverage(targetCoverageInput);
  if (targetCoverage === null) {
    return { ok: false, message: "El % de garantia debe ser un numero entre 0 y 100." };
  }

  const guaranteePaymentPreference = parseGuaranteePaymentPreference(
    guaranteePaymentPreferenceInput,
  );
  if (guaranteePaymentPreference === null) {
    return { ok: false, message: "La preferencia de pago es invalida." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const payloads =
    ruleScope === "single_rule"
      ? ruleKeys.map((ruleKey) => ({
          guarantee_start_month: guaranteeStartMonth,
          guarantee_end_month: guaranteeEndMonth,
          scope_type: scopeType,
          scope_value: scopeValue,
          scope_label: scopeLabel || null,
          rule_scope: "single_rule" as const,
          rule_key: ruleKey,
          target_coverage: targetCoverage,
          guarantee_payment_preference: guaranteePaymentPreference,
          is_active: true,
          note: note || null,
          created_by: user.id,
          updated_by: user.id,
        }))
      : [
          {
            guarantee_start_month: guaranteeStartMonth,
            guarantee_end_month: guaranteeEndMonth,
            scope_type: scopeType,
            scope_value: scopeValue,
            scope_label: scopeLabel || null,
            rule_scope: "all_rules" as const,
            rule_key: null,
            target_coverage: targetCoverage,
            guarantee_payment_preference: guaranteePaymentPreference,
            is_active: true,
            note: note || null,
            created_by: user.id,
            updated_by: user.id,
          },
        ];

  let createdCount = 0;
  let duplicateCount = 0;
  for (const payload of payloads) {
    const insertResult = await supabase.from("team_incentive_guarantees").insert(payload);
    if (!insertResult.error) {
      createdCount += 1;
      continue;
    }

    if (isMissingRelationError(insertResult.error)) {
      const tableName = getMissingRelationName(insertResult.error) ?? "team_incentive_guarantees";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Ejecuta docs/team-incentive-guarantees-schema.sql`,
      };
    }

    const message = String(insertResult.error.message ?? "");
    if (message.toLowerCase().includes("duplicate key")) {
      duplicateCount += 1;
      continue;
    }

    return { ok: false, message: `No se pudo guardar garantia: ${insertResult.error.message}` };
  }

  if (createdCount === 0 && duplicateCount > 0) {
    return {
      ok: false,
      message: "Las garantias seleccionadas ya existen activas para esa vigencia y alcance.",
    };
  }

  revalidatePath("/admin/garantias");
  if (duplicateCount > 0) {
    return {
      ok: true,
      message: `Garantias guardadas: ${createdCount}. Omitidas por duplicado: ${duplicateCount}.`,
    };
  }
  return { ok: true, message: `Garantias guardadas: ${createdCount}.` };
}

export async function setGarantiaActiveAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const garantiaId = String(formData.get("garantia_id") ?? "").trim();
  const nextActiveRaw = String(formData.get("next_active") ?? "").trim().toLowerCase();
  const nextActive = nextActiveRaw === "true";

  if (!garantiaId) {
    return { ok: false, message: "Falta garantia_id." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const updateResult = await supabase
    .from("team_incentive_guarantees")
    .update({
      is_active: nextActive,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", garantiaId);

  if (updateResult.error) {
    if (isMissingRelationError(updateResult.error)) {
      const tableName = getMissingRelationName(updateResult.error) ?? "team_incentive_guarantees";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Ejecuta docs/team-incentive-guarantees-schema.sql`,
      };
    }

    return {
      ok: false,
      message: `No se pudo actualizar garantia: ${updateResult.error.message}`,
    };
  }

  revalidatePath("/admin/garantias");
  return { ok: true, message: nextActive ? "Garantia activada." : "Garantia desactivada." };
}

export async function updateGarantiaAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const garantiaId = String(formData.get("garantia_id") ?? "").trim();
  if (!garantiaId) {
    return { ok: false, message: "Falta garantia_id." };
  }

  const guaranteeStartInput = String(formData.get("guarantee_start_month") ?? "").trim();
  const guaranteeEndInput = String(formData.get("guarantee_end_month") ?? "").trim();
  const scopeType = String(formData.get("scope_type") ?? "").trim();
  const scopeValueInput = String(formData.get("scope_value") ?? "").trim();
  const scopeLabel = String(formData.get("scope_label") ?? "").trim();
  const ruleScope = String(formData.get("rule_scope") ?? "").trim();
  const ruleKeyInput = String(formData.get("rule_key") ?? "").trim();
  const ruleKeysInput = String(formData.get("rule_keys") ?? "").trim();
  const targetCoverageInput = String(formData.get("target_coverage") ?? "").trim();
  const guaranteePaymentPreferenceInput = String(
    formData.get("guarantee_payment_preference") ?? "",
  ).trim();
  const note = String(formData.get("note") ?? "").trim();

  const guaranteeStartMonth = normalizePeriodMonthInput(guaranteeStartInput);
  if (!guaranteeStartMonth) {
    return { ok: false, message: "Inicio de garantia invalido. Usa formato YYYY-MM." };
  }

  const guaranteeEndMonth = normalizePeriodMonthInput(guaranteeEndInput);
  if (!guaranteeEndMonth) {
    return { ok: false, message: "Fin de garantia invalido. Usa formato YYYY-MM." };
  }

  if (guaranteeEndMonth < guaranteeStartMonth) {
    return { ok: false, message: "El fin de garantia no puede ser menor al inicio." };
  }

  if (!["linea", "team_id", "representante"].includes(scopeType)) {
    return { ok: false, message: "scope_type invalido." };
  }

  const scopeValue = normalizeScopeValue(scopeValueInput, scopeType);
  if (!scopeValue) {
    return { ok: false, message: "Debes seleccionar el valor del alcance." };
  }

  if (!["all_rules", "single_rule"].includes(ruleScope)) {
    return { ok: false, message: "rule_scope invalido." };
  }

  const parsedRuleKeys = parseRuleKeysInput(ruleKeysInput);
  const fallbackRuleKey = ruleKeyInput.trim();
  const selectedRuleKey =
    ruleScope === "single_rule"
      ? parsedRuleKeys[0] ?? (fallbackRuleKey || "")
      : "";
  if (ruleScope === "single_rule" && !selectedRuleKey) {
    return { ok: false, message: "Debes seleccionar una regla puntual." };
  }

  const targetCoverage = parseTargetCoverage(targetCoverageInput);
  if (targetCoverage === null) {
    return { ok: false, message: "El % de garantia debe ser un numero entre 0 y 100." };
  }

  const guaranteePaymentPreference = parseGuaranteePaymentPreference(
    guaranteePaymentPreferenceInput,
  );
  if (guaranteePaymentPreference === null) {
    return { ok: false, message: "La preferencia de pago es invalida." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const updateResult = await supabase
    .from("team_incentive_guarantees")
    .update({
      guarantee_start_month: guaranteeStartMonth,
      guarantee_end_month: guaranteeEndMonth,
      scope_type: scopeType,
      scope_value: scopeValue,
      scope_label: scopeLabel || null,
      rule_scope: ruleScope,
      rule_key: ruleScope === "single_rule" ? selectedRuleKey : null,
      target_coverage: targetCoverage,
      guarantee_payment_preference: guaranteePaymentPreference,
      note: note || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", garantiaId);

  if (updateResult.error) {
    if (isMissingRelationError(updateResult.error)) {
      const tableName = getMissingRelationName(updateResult.error) ?? "team_incentive_guarantees";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Ejecuta docs/team-incentive-guarantees-schema.sql`,
      };
    }

    const message = String(updateResult.error.message ?? "");
    if (message.toLowerCase().includes("duplicate key")) {
      return {
        ok: false,
        message: "Ya existe una garantia activa igual para esa vigencia y alcance.",
      };
    }

    return {
      ok: false,
      message: `No se pudo actualizar garantia: ${updateResult.error.message}`,
    };
  }

  revalidatePath("/admin/garantias");
  return { ok: true, message: "Garantia actualizada." };
}

export async function deleteGarantiaAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { role, isActive } = await getCurrentAuthContext();
  if (!isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const garantiaId = String(formData.get("garantia_id") ?? "").trim();
  if (!garantiaId) {
    return { ok: false, message: "Falta garantia_id." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const deleteResult = await supabase
    .from("team_incentive_guarantees")
    .delete()
    .eq("id", garantiaId);

  if (deleteResult.error) {
    if (isMissingRelationError(deleteResult.error)) {
      const tableName = getMissingRelationName(deleteResult.error) ?? "team_incentive_guarantees";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Ejecuta docs/team-incentive-guarantees-schema.sql`,
      };
    }

    return {
      ok: false,
      message: `No se pudo eliminar garantia: ${deleteResult.error.message}`,
    };
  }

  revalidatePath("/admin/garantias");
  return { ok: true, message: "Garantia eliminada." };
}

export async function uploadGarantiasBatchAction(
  _prevState: UploadGarantiasBatchResult,
  formData: FormData,
): Promise<UploadGarantiasBatchResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const uploadedFile = formData.get("file");
  if (!(uploadedFile instanceof File)) {
    return { ok: false, message: "Debes seleccionar un archivo Excel o CSV." };
  }

  if (uploadedFile.size <= 0) {
    return { ok: false, message: "El archivo esta vacio." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  let rows: Array<Record<string, unknown>> = [];
  try {
    const { read, utils } = await import("xlsx");
    const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());
    const workbook = read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0] ?? "";
    if (!sheetName || !workbook.Sheets[sheetName]) {
      return { ok: false, message: "No se encontro una hoja valida en el archivo." };
    }

    rows = utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
      defval: "",
    });
  } catch {
    return { ok: false, message: "No se pudo leer el archivo. Usa plantilla CSV/XLSX valida." };
  }

  if (!rows.length) {
    return { ok: false, message: "El archivo no contiene filas para procesar." };
  }

  let processedRows = 0;
  let createdRows = 0;
  let duplicatedRows = 0;
  let invalidRows = 0;
  const sampleErrors: string[] = [];
  const representativeLookupCache = new Map<string, { route: string; label: string } | null>();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? {};
    const headers = Object.keys(row);
    const normalizedHeaderMap = new Map<string, string>();
    for (const header of headers) {
      normalizedHeaderMap.set(normalizeHeader(header), header);
    }

    processedRows += 1;
    const rowNumber = index + 2;

    const noEmpleado = parseEmployeeNumber(
      getCellString(row, normalizedHeaderMap, ["no_empleado", "empleado", "employee_id"]),
    );
    const guaranteeStartMonth = parseGuaranteeMonthInput(
      getCellString(row, normalizedHeaderMap, ["guarantee_start_month", "inicio_garantia", "inicio"]),
    );
    const guaranteeEndMonth = parseGuaranteeMonthInput(
      getCellString(row, normalizedHeaderMap, ["guarantee_end_month", "fin_garantia", "fin"]),
    );
    const ruleScopeRaw = getCellString(row, normalizedHeaderMap, ["rule_scope", "nivel_regla"]);
    const ruleScope = ruleScopeRaw === "single_rule" ? "single_rule" : "all_rules";
    const ruleKey = getCellString(row, normalizedHeaderMap, ["rule_key", "regla", "product_name"]);
    const note = getCellString(row, normalizedHeaderMap, ["note", "nota"]);
    const isActive = parseBooleanLike(
      getCellString(row, normalizedHeaderMap, ["is_active", "activo"]),
      true,
    );

    if (!noEmpleado) {
      invalidRows += 1;
      if (sampleErrors.length < 20) sampleErrors.push(`Fila ${rowNumber}: no_empleado requerido.`);
      continue;
    }
    if (!guaranteeStartMonth) {
      invalidRows += 1;
      if (sampleErrors.length < 20) {
        sampleErrors.push(`Fila ${rowNumber}: inicio de garantia invalido (YYYY-MM).`);
      }
      continue;
    }
    if (!guaranteeEndMonth) {
      invalidRows += 1;
      if (sampleErrors.length < 20) {
        sampleErrors.push(`Fila ${rowNumber}: fin de garantia invalido (YYYY-MM).`);
      }
      continue;
    }
    if (guaranteeEndMonth < guaranteeStartMonth) {
      invalidRows += 1;
      if (sampleErrors.length < 20) {
        sampleErrors.push(`Fila ${rowNumber}: fin de garantia menor a inicio.`);
      }
      continue;
    }
    if (ruleScope === "single_rule" && !ruleKey) {
      invalidRows += 1;
      if (sampleErrors.length < 20) {
        sampleErrors.push(`Fila ${rowNumber}: rule_key requerido para single_rule.`);
      }
      continue;
    }

    const lookupKey = `${guaranteeStartMonth}|${noEmpleado}`;
    let representativeData = representativeLookupCache.get(lookupKey);
    if (representativeData === undefined) {
      const representativeResult = await supabase
        .from("sales_force_status")
        .select("territorio_individual, nombre_completo")
        .eq("period_month", guaranteeStartMonth)
        .eq("is_deleted", false)
        .eq("no_empleado", noEmpleado)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ territorio_individual: string | null; nombre_completo: string | null }>();

      const route = String(representativeResult.data?.territorio_individual ?? "").trim();
      if (!representativeResult.error && route) {
        const name = String(representativeResult.data?.nombre_completo ?? "").trim();
        representativeData = {
          route,
          label: name ? `${name} (${route}) - emp ${noEmpleado}` : `${route} - emp ${noEmpleado}`,
        };
      } else {
        representativeData = null;
      }
      representativeLookupCache.set(lookupKey, representativeData);
    }

    if (!representativeData) {
      invalidRows += 1;
      if (sampleErrors.length < 20) {
        sampleErrors.push(
          `Fila ${rowNumber}: no_empleado ${noEmpleado} no encontrado en sales_force_status para ${guaranteeStartMonth.slice(0, 7)}.`,
        );
      }
      continue;
    }

    const insertResult = await supabase.from("team_incentive_guarantees").insert({
      guarantee_start_month: guaranteeStartMonth,
      guarantee_end_month: guaranteeEndMonth,
      scope_type: "representante",
      scope_value: representativeData.route,
      scope_label: representativeData.label,
      rule_scope: ruleScope,
      rule_key: ruleScope === "single_rule" ? ruleKey : null,
      target_coverage: 100,
      guarantee_payment_preference: "max_pay",
      is_active: isActive,
      note: note || null,
      created_by: user.id,
      updated_by: user.id,
    });

    if (!insertResult.error) {
      createdRows += 1;
      continue;
    }

    if (isMissingRelationError(insertResult.error)) {
      const tableName = getMissingRelationName(insertResult.error) ?? "team_incentive_guarantees";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Ejecuta docs/team-incentive-guarantees-schema.sql`,
      };
    }

    const message = String(insertResult.error.message ?? "");
    if (message.toLowerCase().includes("duplicate key")) {
      duplicatedRows += 1;
      continue;
    }

    invalidRows += 1;
    if (sampleErrors.length < 20) {
      sampleErrors.push(`Fila ${rowNumber}: ${insertResult.error.message}`);
    }
  }

  revalidatePath("/admin/garantias");
  return {
    ok: true,
    message: `Batch procesado. Creadas: ${createdRows}. Duplicadas: ${duplicatedRows}. Invalidas: ${invalidRows}.`,
    processedRows,
    createdRows,
    duplicatedRows,
    invalidRows,
    sampleErrors,
  };
}
