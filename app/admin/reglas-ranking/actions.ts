"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { isAdminRole } from "@/lib/auth/impersonation";
import {
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";
import { createAdminClient } from "@/lib/supabase/admin";

type UploadRankingComplementResult =
  | {
      ok: true;
      message: string;
      periodMonth: string;
      sheetName: string;
      processedRows: number;
      skippedEmptyRows: number;
    }
  | {
      ok: false;
      message: string;
      validationErrors?: string[];
    };

function normalizeHeader(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBooleanCheckbox(value: FormDataEntryValue | null): boolean {
  if (typeof value !== "string") return false;
  return value === "on" || value === "true" || value === "1";
}

function normalizePeriodInput(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return normalizePeriodMonthInput(raw);
}

function normalizeScopeInput(value: unknown): "rep" | "manager" | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "rep") return "rep";
  if (raw === "manager" || raw === "manger") return "manager";
  return null;
}

function normalizeParticipationScopeInput(value: unknown): "all_fdv" | "ranking_groups" | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "all_fdv") return "all_fdv";
  if (raw === "ranking_groups") return "ranking_groups";
  return null;
}

function parseBooleanText(value: unknown): boolean {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes" || raw === "si";
}

export async function uploadReglasRankingComplementExcelAction(
  _prevState: UploadRankingComplementResult | null,
  formData: FormData,
): Promise<UploadRankingComplementResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const periodInput = String(formData.get("period_month") ?? "").trim();
  const selectedSheetName = String(formData.get("sheet_name") ?? "").trim();
  const file = formData.get("file");

  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) {
    return { ok: false, message: "Periodo invalido. Usa formato YYYY-MM." };
  }

  if (!(file instanceof File)) {
    return { ok: false, message: "Debes seleccionar un archivo Excel." };
  }

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
    return { ok: false, message: "El archivo debe ser Excel (.xlsx o .xls)." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const statusValidation = await supabase
    .from("sales_force_status")
    .select("id", { count: "exact", head: true })
    .eq("period_month", periodMonth)
    .eq("is_deleted", false);

  if (statusValidation.error) {
    return {
      ok: false,
      message: `No se pudo validar periodo en status: ${statusValidation.error.message}`,
    };
  }

  if ((statusValidation.count ?? 0) <= 0) {
    return { ok: false, message: "El periodo seleccionado no existe en Status." };
  }

  const arrayBuffer = await file.arrayBuffer();
  const { read, utils } = await import("xlsx");
  const workbook = read(Buffer.from(arrayBuffer), { type: "buffer" });
  const finalSheetName = selectedSheetName || workbook.SheetNames[0];
  if (!finalSheetName || !workbook.Sheets[finalSheetName]) {
    return { ok: false, message: "No se encontro la pestaña seleccionada en el archivo." };
  }

  const rows = utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[finalSheetName], {
    defval: "",
  });
  if (rows.length === 0) {
    return { ok: false, message: "La hoja no contiene filas con datos." };
  }

  const firstRowHeaders = Object.keys(rows[0] ?? {});
  const headerMap = new Map<string, string>();
  for (const header of firstRowHeaders) {
    headerMap.set(normalizeHeader(header), header);
  }

  const resolveHeader = (candidates: string[]): string | null => {
    for (const candidate of candidates) {
      const found = headerMap.get(normalizeHeader(candidate));
      if (found) return found;
    }
    return null;
  };

  const headerKeys = {
    teamId: resolveHeader(["team_id", "team", "teamid"]),
    productName: resolveHeader(["product_name", "product", "producto", "plan"]),
    ranking: resolveHeader(["ranking"]),
    puntosRankingLvu: resolveHeader([
      "puntos_ranking_lvu",
      "puntos_ranking",
      "puntos ranking lvu",
      "puntos ranking",
    ]),
    prodWeight: resolveHeader(["prod_weight", "prod_weigh", "product_weight"]),
  };

  const missingHeaders = [
    !headerKeys.teamId ? "team_id" : null,
    !headerKeys.productName ? "product_name" : null,
  ].filter((value): value is string => Boolean(value));

  if (missingHeaders.length > 0) {
    return {
      ok: false,
      message: "Faltan columnas requeridas en el Excel.",
      validationErrors: missingHeaders.map((key) => `Header faltante: ${key}`),
    };
  }

  if (!headerKeys.ranking && !headerKeys.puntosRankingLvu && !headerKeys.prodWeight) {
    return {
      ok: false,
      message: "El archivo no contiene columnas de complemento.",
      validationErrors: [
        "Se requiere al menos una columna: ranking, puntos_ranking_lvu o prod_weight.",
      ],
    };
  }

  const validationErrors: string[] = [];
  let skippedEmptyRows = 0;
  const upsertRows: Array<{
    period_month: string;
    team_id: string;
    product_name: string;
    ranking: string | null;
    puntos_ranking_lvu: number | null;
    prod_weight: number | null;
    source_type: string;
    source_file_name: string;
    source_sheet_name: string;
    updated_by: string;
    is_active: boolean;
  }> = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 2;

    const teamId = normalizeText(row[headerKeys.teamId as string]);
    const productName = normalizeText(row[headerKeys.productName as string]);
    const ranking = headerKeys.ranking ? normalizeText(row[headerKeys.ranking]) : "";
    const puntosRankingLvu = headerKeys.puntosRankingLvu
      ? parseOptionalNumber(row[headerKeys.puntosRankingLvu])
      : null;
    const prodWeight = headerKeys.prodWeight ? parseOptionalNumber(row[headerKeys.prodWeight]) : null;

    const isEmpty =
      !teamId &&
      !productName &&
      !ranking &&
      puntosRankingLvu === null &&
      prodWeight === null;

    if (isEmpty) {
      skippedEmptyRows += 1;
      continue;
    }

    if (!teamId) validationErrors.push(`Fila ${rowNumber}: team_id requerido.`);
    if (!productName) validationErrors.push(`Fila ${rowNumber}: product_name requerido.`);
    if (!ranking && puntosRankingLvu === null && prodWeight === null) {
      validationErrors.push(
        `Fila ${rowNumber}: define al menos ranking o puntos_ranking_lvu o prod_weight.`,
      );
    }

    if (validationErrors.length > 60) {
      return {
        ok: false,
        message: "Se detectaron demasiados errores de validacion.",
        validationErrors: validationErrors.slice(0, 60),
      };
    }

    upsertRows.push({
      period_month: periodMonth,
      team_id: teamId,
      product_name: productName,
      ranking: ranking || null,
      puntos_ranking_lvu: puntosRankingLvu,
      prod_weight: prodWeight,
      source_type: "excel_complement",
      source_file_name: file.name,
      source_sheet_name: finalSheetName,
      updated_by: user.id,
      is_active: true,
    });
  }

  if (validationErrors.length > 0) {
    return {
      ok: false,
      message: "No se pudo importar por errores de validacion.",
      validationErrors: validationErrors.slice(0, 60),
    };
  }

  if (upsertRows.length === 0) {
    return {
      ok: false,
      message: "No se encontraron filas validas para importar.",
    };
  }

  const upsertResult = await supabase.from("ranking_rule_complements").upsert(upsertRows, {
    onConflict: "period_month,team_id,product_name",
  });

  if (upsertResult.error) {
    if (isMissingRelationError(upsertResult.error)) {
      const tableName = getMissingRelationName(upsertResult.error) ?? "ranking_rule_complements";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Ejecuta docs/ranking-rule-complements-schema.sql.`,
      };
    }
    return {
      ok: false,
      message: `No se pudo guardar complementos: ${upsertResult.error.message}`,
    };
  }

  revalidatePath("/admin/reglas-ranking");
  return {
    ok: true,
    message: "Complementos de ranking importados.",
    periodMonth,
    sheetName: finalSheetName,
    processedRows: upsertRows.length,
    skippedEmptyRows,
  };
}

type UpsertManualRankingComplementResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function upsertManualReglasRankingComplementAction(
  _prevState: UpsertManualRankingComplementResult | null,
  formData: FormData,
): Promise<UpsertManualRankingComplementResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const periodInput = String(formData.get("period_month") ?? "").trim();
  const teamId = normalizeText(formData.get("team_id"));
  const productName = normalizeText(formData.get("product_name"));
  const prodWeight = parseOptionalNumber(formData.get("prod_weight"));

  const rankingOption = normalizeText(formData.get("ranking_option"));
  const rankingCustom = normalizeText(formData.get("ranking_custom"));
  const puntosOption = normalizeText(formData.get("puntos_option"));
  const puntosCustom = normalizeText(formData.get("puntos_custom"));

  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) return { ok: false, message: "Periodo invalido. Usa formato YYYY-MM." };
  if (!teamId) return { ok: false, message: "team_id es requerido." };
  if (!productName) return { ok: false, message: "product_name es requerido." };

  const ranking = rankingOption === "__new__" ? rankingCustom : rankingOption;
  const puntosRaw = puntosOption === "__new__" ? puntosCustom : puntosOption;
  const puntosRankingLvu = parseOptionalNumber(puntosRaw);

  if (!ranking && puntosRankingLvu === null && prodWeight === null) {
    return {
      ok: false,
      message: "Define al menos ranking, puntos_ranking_lvu o prod_weight.",
    };
  }

  if (puntosRaw && puntosRankingLvu === null) {
    return { ok: false, message: "puntos_ranking_lvu debe ser numerico." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const upsertResult = await supabase.from("ranking_rule_complements").upsert(
    {
      period_month: periodMonth,
      team_id: teamId,
      product_name: productName,
      ranking: ranking || null,
      puntos_ranking_lvu: puntosRankingLvu,
      prod_weight: prodWeight,
      source_type: "manual_complement",
      source_file_name: null,
      source_sheet_name: null,
      updated_by: user.id,
      is_active: true,
    },
    { onConflict: "period_month,team_id,product_name" },
  );

  if (upsertResult.error) {
    if (isMissingRelationError(upsertResult.error)) {
      const tableName = getMissingRelationName(upsertResult.error) ?? "ranking_rule_complements";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Ejecuta docs/ranking-rule-complements-schema.sql.`,
      };
    }
    return {
      ok: false,
      message: `No se pudo guardar complemento manual: ${upsertResult.error.message}`,
    };
  }

  revalidatePath("/admin/reglas-ranking");
  return { ok: true, message: "Complemento manual guardado." };
}

type UpsertRankingContestResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function upsertRankingContestAction(
  _prevState: UpsertRankingContestResult | null,
  formData: FormData,
): Promise<UpsertRankingContestResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const contestId = normalizeText(formData.get("contest_id"));
  const contestName = normalizeText(formData.get("contest_name"));
  const scope = normalizeScopeInput(formData.get("scope"));
  const participationScope = normalizeParticipationScopeInput(formData.get("participation_scope"));
  const paymentDateRaw = normalizeText(formData.get("payment_date"));
  const coverageStartRaw = normalizeText(formData.get("coverage_period_start"));
  const coverageEndRaw = normalizeText(formData.get("coverage_period_end"));
  const orderValueRaw = normalizeText(formData.get("order_value"));
  const paymentDate = normalizePeriodInput(paymentDateRaw);
  const coverageStart = normalizePeriodInput(coverageStartRaw);
  const coverageEnd = normalizePeriodInput(coverageEndRaw);
  const orderValue = parseOptionalNumber(orderValueRaw);
  const isActiveContest = parseBooleanCheckbox(formData.get("is_active"));

  const componentNames = formData.getAll("component_name[]").map((item) => normalizeText(item));
  const componentThresholdsRaw = formData
    .getAll("component_threshold[]")
    .map((item) => normalizeText(item));
  const componentStartRaw = formData.getAll("component_start[]").map((item) => normalizeText(item));
  const componentEndRaw = formData.getAll("component_end[]").map((item) => normalizeText(item));
  const componentActivesRaw = formData.getAll("component_active[]").map((item) => normalizeText(item));
  const prizePlacesRaw = formData.getAll("prize_place[]").map((item) => normalizeText(item));
  const prizeTitlesRaw = formData.getAll("prize_title[]").map((item) => normalizeText(item));
  const prizeAmountsRaw = formData.getAll("prize_amount_mxn[]").map((item) => normalizeText(item));
  const prizeDescriptionsRaw = formData.getAll("prize_description[]").map((item) => normalizeText(item));

  if (!contestName) {
    return { ok: false, message: "Nombre del concurso es requerido." };
  }
  if (!scope) {
    return { ok: false, message: "Alcance invalido. Usa Rep o Manager." };
  }
  if (!participationScope) {
    return { ok: false, message: "Scope de participacion invalido." };
  }
  if (paymentDateRaw && !paymentDate) {
    return { ok: false, message: "Fecha de pago invalida. Usa formato YYYY-MM." };
  }
  if (coverageStartRaw && !coverageStart) {
    return { ok: false, message: "Periodo inicio cobertura invalido. Usa YYYY-MM." };
  }
  if (coverageEndRaw && !coverageEnd) {
    return { ok: false, message: "Periodo fin cobertura invalido. Usa YYYY-MM." };
  }
  if (coverageStart && coverageEnd && coverageStart > coverageEnd) {
    return { ok: false, message: "Periodo cobertura: inicio no puede ser mayor que fin." };
  }
  if (orderValueRaw && orderValue === null) {
    return { ok: false, message: "Orden invalido. Usa un valor numerico." };
  }

  const components: Array<{
    component_name: string;
    threshold_value: number | null;
    period_start: string | null;
    period_end: string | null;
    is_active: boolean;
    sort_order: number;
  }> = [];
  const prizes: Array<{
    place_no: number;
    title: string | null;
    amount_mxn: number | null;
    description: string | null;
    sort_order: number;
  }> = [];

  const maxLen = Math.max(
    componentNames.length,
    componentThresholdsRaw.length,
    componentStartRaw.length,
    componentEndRaw.length,
    componentActivesRaw.length,
  );

  for (let index = 0; index < maxLen; index += 1) {
    const name = componentNames[index] ?? "";
    const thresholdRaw = componentThresholdsRaw[index] ?? "";
    const startRaw = componentStartRaw[index] ?? "";
    const endRaw = componentEndRaw[index] ?? "";
    const isActive = parseBooleanText(componentActivesRaw[index] ?? "");
    const threshold = parseOptionalNumber(thresholdRaw);
    const periodStart = normalizePeriodInput(startRaw);
    const periodEnd = normalizePeriodInput(endRaw);

    const emptyRow = !name && !thresholdRaw && !startRaw && !endRaw;
    if (emptyRow) continue;

    if (!name) {
      return { ok: false, message: `Componente #${index + 1}: nombre requerido.` };
    }
    if (startRaw && !periodStart) {
      return { ok: false, message: `Componente ${name}: periodo inicio invalido.` };
    }
    if (endRaw && !periodEnd) {
      return { ok: false, message: `Componente ${name}: periodo fin invalido.` };
    }
    if (periodStart && periodEnd && periodStart > periodEnd) {
      return { ok: false, message: `Componente ${name}: inicio no puede ser mayor que fin.` };
    }

    if (isActive) {
      if (threshold === null) {
        return { ok: false, message: `Componente ${name} activo: define umbral.` };
      }
      if (!periodStart || !periodEnd) {
        return { ok: false, message: `Componente ${name} activo: define inicio y fin.` };
      }
    }

    components.push({
      component_name: name,
      threshold_value: threshold,
      period_start: periodStart,
      period_end: periodEnd,
      is_active: isActive,
      sort_order: components.length,
    });
  }

  const maxPrizeLen = Math.max(
    prizePlacesRaw.length,
    prizeTitlesRaw.length,
    prizeAmountsRaw.length,
    prizeDescriptionsRaw.length,
  );

  for (let index = 0; index < maxPrizeLen; index += 1) {
    const placeRaw = prizePlacesRaw[index] ?? "";
    const titleRaw = prizeTitlesRaw[index] ?? "";
    const amountRaw = prizeAmountsRaw[index] ?? "";
    const descriptionRaw = prizeDescriptionsRaw[index] ?? "";

    const isEmpty = !placeRaw && !titleRaw && !amountRaw && !descriptionRaw;
    if (isEmpty) continue;

    const placeNo = Number(placeRaw);
    const amountMxn = parseOptionalNumber(amountRaw);

    if (!Number.isInteger(placeNo) || placeNo <= 0) {
      return { ok: false, message: `Premio #${index + 1}: posicion invalida.` };
    }
    if (amountRaw && amountMxn === null) {
      return { ok: false, message: `Premio posicion ${placeNo}: monto invalido.` };
    }

    prizes.push({
      place_no: placeNo,
      title: titleRaw || null,
      amount_mxn: amountMxn,
      description: descriptionRaw || null,
      sort_order: prizes.length,
    });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }
  const payload = {
    contest_name: contestName,
    scope,
    participation_scope: participationScope,
    payment_date: paymentDate,
    coverage_period_start: coverageStart,
    coverage_period_end: coverageEnd,
    order_value: orderValue,
    is_active: isActiveContest,
    updated_by: user.id,
  };

  const upsertResult = contestId
    ? await supabase.from("ranking_contests").update(payload).eq("id", contestId).select("id").single()
    : await supabase.from("ranking_contests").insert(payload).select("id").single();

  if (upsertResult.error) {
    if (
      String(upsertResult.error.message ?? "").includes("ranking_contests_coverage_period_end_chk")
    ) {
      return {
        ok: false,
        message:
          "No se pudo guardar concurso: esquema desalineado en ranking_contests (coverage_period_end). Ejecuta la migracion SQL de normalizacion YYYY-MM.",
      };
    }
    if (isMissingRelationError(upsertResult.error)) {
      const tableName = getMissingRelationName(upsertResult.error) ?? "ranking_contests";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Ejecuta docs/ranking-contests-schema.sql.`,
      };
    }
    return {
      ok: false,
      message: `No se pudo guardar concurso: ${upsertResult.error.message}`,
    };
  }

  if (!upsertResult.data) {
    return { ok: false, message: "No se encontro el concurso a actualizar. No se aplicaron cambios." };
  }

  const savedContestId = String((upsertResult.data as { id?: string }).id ?? "").trim();
  if (!savedContestId) {
    return { ok: false, message: "No se pudo resolver el id del concurso guardado." };
  }

  const deleteComponentsResult = await supabase
    .from("ranking_contest_components")
    .delete()
    .eq("contest_id", savedContestId);

  if (deleteComponentsResult.error) {
    if (isMissingRelationError(deleteComponentsResult.error)) {
      const tableName =
        getMissingRelationName(deleteComponentsResult.error) ?? "ranking_contest_components";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Ejecuta docs/ranking-contests-schema.sql.`,
      };
    }
    return {
      ok: false,
      message: `No se pudo limpiar componentes del concurso: ${deleteComponentsResult.error.message}`,
    };
  }

  if (components.length > 0) {
    const insertComponentsResult = await supabase.from("ranking_contest_components").insert(
      components.map((item) => ({
        contest_id: savedContestId,
        ...item,
      })),
    );

    if (insertComponentsResult.error) {
      if (isMissingRelationError(insertComponentsResult.error)) {
        const tableName =
          getMissingRelationName(insertComponentsResult.error) ?? "ranking_contest_components";
        return {
          ok: false,
          message: `No existe la tabla ${tableName}. Ejecuta docs/ranking-contests-schema.sql.`,
        };
      }
      return {
        ok: false,
        message: `No se pudo guardar componentes del concurso: ${insertComponentsResult.error.message}`,
      };
    }
  }

  const deletePrizesResult = await supabase
    .from("ranking_contest_prizes")
    .delete()
    .eq("contest_id", savedContestId);

  if (deletePrizesResult.error) {
    if (isMissingRelationError(deletePrizesResult.error)) {
      const tableName = getMissingRelationName(deletePrizesResult.error) ?? "ranking_contest_prizes";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Ejecuta docs/ranking-contests-schema.sql.`,
      };
    }
    return {
      ok: false,
      message: `No se pudo limpiar premios del concurso: ${deletePrizesResult.error.message}`,
    };
  }

  if (prizes.length > 0) {
    const insertPrizesResult = await supabase.from("ranking_contest_prizes").insert(
      prizes.map((item) => ({
        contest_id: savedContestId,
        ...item,
      })),
    );

    if (insertPrizesResult.error) {
      if (isMissingRelationError(insertPrizesResult.error)) {
        const tableName = getMissingRelationName(insertPrizesResult.error) ?? "ranking_contest_prizes";
        return {
          ok: false,
          message: `No existe la tabla ${tableName}. Ejecuta docs/ranking-contests-schema.sql.`,
        };
      }
      return {
        ok: false,
        message: `No se pudo guardar premios del concurso: ${insertPrizesResult.error.message}`,
      };
    }
  }

  revalidatePath("/admin/reglas-ranking");
  return { ok: true, message: contestId ? "Concurso actualizado." : "Concurso creado." };
}

type DeleteRankingContestResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function deleteRankingContestAction(
  _prevState: DeleteRankingContestResult | null,
  formData: FormData,
): Promise<DeleteRankingContestResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const contestId = normalizeText(formData.get("contest_id"));
  if (!contestId) {
    return { ok: false, message: "contest_id es requerido." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const deleteResult = await supabase.from("ranking_contests").delete().eq("id", contestId);

  if (deleteResult.error) {
    if (isMissingRelationError(deleteResult.error)) {
      const tableName = getMissingRelationName(deleteResult.error) ?? "ranking_contests";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Ejecuta docs/ranking-contests-schema.sql.`,
      };
    }
    return {
      ok: false,
      message: `No se pudo eliminar concurso: ${deleteResult.error.message}`,
    };
  }

  revalidatePath("/admin/reglas-ranking");
  return { ok: true, message: "Concurso eliminado." };
}

type UpsertRankingContestParticipantsResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function upsertRankingContestParticipantsAction(
  _prevState: UpsertRankingContestParticipantsResult | null,
  formData: FormData,
): Promise<UpsertRankingContestParticipantsResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const contestId = normalizeText(formData.get("contest_id"));
  if (!contestId) {
    return { ok: false, message: "contest_id es requerido." };
  }

  const groupIds = Array.from(
    new Set(
      formData
        .getAll("ranking_group_ids[]")
        .map((value) => normalizeText(value))
        .filter((value) => value.length > 0),
    ),
  );

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const deleteResult = await supabase
    .from("ranking_contest_participants")
    .delete()
    .eq("contest_id", contestId);

  if (deleteResult.error) {
    if (isMissingRelationError(deleteResult.error)) {
      const tableName = getMissingRelationName(deleteResult.error) ?? "ranking_contest_participants";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Ejecuta docs/ranking-contests-schema.sql.`,
      };
    }
    return {
      ok: false,
      message: `No se pudo limpiar participantes del concurso: ${deleteResult.error.message}`,
    };
  }

  if (groupIds.length > 0) {
    const insertResult = await supabase.from("ranking_contest_participants").insert(
      groupIds.map((groupId) => ({
        contest_id: contestId,
        ranking_group_id: groupId,
        updated_by: user.id,
      })),
    );

    if (insertResult.error) {
      if (isMissingRelationError(insertResult.error)) {
        const tableName = getMissingRelationName(insertResult.error) ?? "ranking_contest_participants";
        return {
          ok: false,
          message: `No existe la tabla ${tableName}. Ejecuta docs/ranking-contests-schema.sql.`,
        };
      }
      return {
        ok: false,
        message: `No se pudo guardar participantes del concurso: ${insertResult.error.message}`,
      };
    }
  }

  revalidatePath("/admin/reglas-ranking");
  return { ok: true, message: "Participacion de equipos guardada." };
}
