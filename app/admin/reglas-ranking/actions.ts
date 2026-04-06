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
