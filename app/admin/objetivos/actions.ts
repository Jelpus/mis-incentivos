"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";
import {
  computeObjectivesPreview,
  mergeObjectivesSources,
  parseDrillDownObjectivesFile,
  parseObjectivesFile,
} from "@/lib/admin/objetivos/import-objectives";

const MAX_OBJECTIVES_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export type PreviewObjetivosResult =
  | {
    ok: true;
    message: string;
    periodMonth: string;
    sheetName: string;
    summary: {
      parsedRows: number;
      validRows: number;
      invalidRows: number;
      skippedByPeriod: number;
      duplicatedRows: number;
      expectedRequiredCount: number;
      coveredRequiredCount: number;
      missingRequiredCount: number;
      criticalCount: number;
      warningCount: number;
      routesWithMissingCount: number;
      criticalExamples: string[];
      warningExamples: string[];
      invalidExamples: string[];
      criticalDetails: Array<{
        severity: "critical";
        code: "missing_required_objective";
        sourceType: "private+drilldown";
        sourceFileName: string | null;
        sourceSheetName: string | null;
        rowNumber: number;
        route: string | null;
        productName: string | null;
        teamId: string | null;
        message: string;
        actionSuggestion: string;
      }>;
      invalidDetails: Array<{
        severity: "critical" | "warning";
        code: string;
        sourceType: "private" | "drilldown" | "private+drilldown";
        sourceFileName: string | null;
        sourceSheetName: string | null;
        rowNumber: number;
        route: string | null;
        productName: string | null;
        teamId: string | null;
        message: string;
        actionSuggestion: string;
      }>;
      missingExamples: string[];
      teamAlerts: Array<{
        teamId: string;
        missingCount: number;
        missingExamples: string[];
      }>;
      sourceBreakdown: Array<{
        sourceType: "private" | "drilldown";
        sourceFileName: string | null;
        sheetName: string;
        parsedRows: number;
        invalidRows: number;
        skippedByPeriod: number;
      }>;
      hasStatusData: boolean;
      hasRuleDefinitions: boolean;
    };
  }
  | {
    ok: false;
    message: string;
  };

export type UploadObjetivosResult =
  | {
    ok: true;
    message: string;
    periodMonth: string;
    versionNo: number;
    versionId: string;
    summary: {
      validRows: number;
      invalidRows: number;
      missingRequiredCount: number;
    };
  }
  | {
    ok: false;
    message: string;
  };

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

function isLegacyObjectiveUniqueConstraintError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? "").trim();
  const message = String(error.message ?? "").toLowerCase();
  if (code !== "23505") return false;
  return message.includes("team_objective_targets_version_id_territorio_individual_pro");
}

async function runPreview(params: {
  formData: FormData;
}) {
  const periodInput = String(params.formData.get("period_month") ?? "").trim();
  const privateSheetNameInput = String(params.formData.get("private_sheet_name") ?? "").trim();
  const drillDownSheetNameInput = String(params.formData.get("drilldown_sheet_name") ?? "").trim();
  const privateFile = params.formData.get("private_file");
  const drillDownFile = params.formData.get("drilldown_file");

  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) {
    return { ok: false as const, message: "Periodo invalido. Usa formato YYYY-MM o YYYY-MM-01." };
  }

  if (!(privateFile instanceof File) || !(drillDownFile instanceof File)) {
    return {
      ok: false as const,
      message: "Debes seleccionar ambos archivos: Objetivos Privados y Drill Down Cuotas.",
    };
  }
  if (privateFile.size <= 0 || drillDownFile.size <= 0) {
    return { ok: false as const, message: "Uno de los archivos esta vacio." };
  }
  if (
    privateFile.size > MAX_OBJECTIVES_FILE_SIZE_BYTES ||
    drillDownFile.size > MAX_OBJECTIVES_FILE_SIZE_BYTES
  ) {
    return { ok: false as const, message: "Uno de los archivos excede el limite de 50MB." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false as const, message: "Admin client no disponible." };
  }

  const statusPeriodValidation = await supabase
    .from("sales_force_status")
    .select("id", { count: "exact", head: true })
    .eq("period_month", periodMonth)
    .eq("is_deleted", false);

  if (statusPeriodValidation.error) {
    return {
      ok: false as const,
      message: `No se pudo validar el periodo en Status: ${statusPeriodValidation.error.message}`,
    };
  }
  if ((statusPeriodValidation.count ?? 0) === 0) {
    return {
      ok: false as const,
      message: "No existe informacion en sales_force_status para el periodo seleccionado.",
    };
  }

  const [privateFileBuffer, drillDownFileBuffer] = await Promise.all([
    privateFile.arrayBuffer(),
    drillDownFile.arrayBuffer(),
  ]);
  const privateParsedInput = parseObjectivesFile({
    fileBuffer: Buffer.from(privateFileBuffer),
    selectedPeriodMonth: periodMonth,
    sourceFileName: privateFile.name,
    requestedSheetName: privateSheetNameInput || null,
  });
  const drillDownParsedInput = parseDrillDownObjectivesFile({
    fileBuffer: Buffer.from(drillDownFileBuffer),
    selectedPeriodMonth: periodMonth,
    sourceFileName: drillDownFile.name,
    requestedSheetName: drillDownSheetNameInput || null,
  });
  const parsedInput = mergeObjectivesSources([
    {
      source: "private",
      fileName: privateFile.name,
      sheetName: privateParsedInput.sheetName,
      parsed: privateParsedInput,
    },
    {
      source: "drilldown",
      fileName: drillDownFile.name,
      sheetName: drillDownParsedInput.sheetName,
      parsed: drillDownParsedInput,
    },
  ]);

  const [statusRowsResult, versionRowsResult] = await Promise.all([
    supabase
      .from("sales_force_status")
      .select("territorio_individual, team_id, is_active, is_vacant")
      .eq("period_month", periodMonth)
      .eq("is_deleted", false),
    supabase
      .from("team_incentive_rule_versions")
      .select("team_id, version_no, created_at, rule_definition_id")
      .eq("period_month", periodMonth),
  ]);

  if (statusRowsResult.error) {
    return {
      ok: false as const,
      message: `No se pudo cargar sales_force_status: ${statusRowsResult.error.message}`,
    };
  }
  if (versionRowsResult.error) {
    if (isMissingRelationError(versionRowsResult.error)) {
      const tableName = getMissingRelationName(versionRowsResult.error) ?? "team_incentive_rule_versions";
      return {
        ok: false as const,
        message: `No existe ${tableName}. Sin reglas versionadas no se puede validar cobertura de objetivos.`,
      };
    }
    return {
      ok: false as const,
      message: `No se pudieron cargar versiones de reglas: ${versionRowsResult.error.message}`,
    };
  }

  const definitionIds = Array.from(
    new Set(
      (versionRowsResult.data ?? [])
        .map((row) => String(row.rule_definition_id ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  );

  let ruleItemRows: Array<{
    definition_id: string | null;
    product_name: string | null;
    plan_type_name: string | null;
  }> = [];

  if (definitionIds.length > 0) {
    const itemRowsResult = await supabase
      .from("team_rule_definition_items")
      .select("definition_id, product_name, plan_type_name")
      .in("definition_id", definitionIds);

    if (itemRowsResult.error) {
      if (isMissingRelationError(itemRowsResult.error)) {
        const tableName = getMissingRelationName(itemRowsResult.error) ?? "team_rule_definition_items";
        return {
          ok: false as const,
          message: `No existe ${tableName}. Crea el esquema normalizado de reglas para validar objetivos.`,
        };
      }
      return {
        ok: false as const,
        message: `No se pudieron cargar items de reglas: ${itemRowsResult.error.message}`,
      };
    }

    ruleItemRows = (itemRowsResult.data ?? []) as Array<{
      definition_id: string | null;
      product_name: string | null;
      plan_type_name: string | null;
    }>;
  }

  const computed = computeObjectivesPreview({
    parsedInput,
    selectedPeriodMonth: periodMonth,
    statusRows: (statusRowsResult.data ?? []) as Array<{
      territorio_individual: string | null;
      team_id: string | null;
      is_active: boolean | null;
      is_vacant: boolean | null;
    }>,
    ruleVersionRows: (versionRowsResult.data ?? []) as Array<{
      team_id: string | null;
      version_no: number | null;
      created_at: string | null;
      rule_definition_id: string | null;
    }>,
    ruleItemRows,
  });

  return {
    ok: true as const,
    uploadedFileName: `${privateFile.name} | ${drillDownFile.name}`,
    periodMonth,
    sheetName: parsedInput.sheetName,
    summary: {
      ...computed.summary,
      hasStatusData: computed.hasStatusData,
      hasRuleDefinitions: computed.hasRuleDefinitions,
    },
    validRowsForInsert: computed.validRowsForInsert,
  };
}

export async function previewObjetivosImportAction(
  _prevState: PreviewObjetivosResult | null,
  formData: FormData,
): Promise<PreviewObjetivosResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const result = await runPreview({ formData });
  if (!result.ok) return result;

  const { summary } = result;
  const message =
    `Preview listo. Filas validas: ${summary.validRows}, criticos: ${summary.criticalCount}, advertencias: ${summary.warningCount}.`;

  return {
    ok: true,
    message,
    periodMonth: result.periodMonth,
    sheetName: result.sheetName,
    summary,
  };
}

export async function uploadObjetivosImportAction(
  _prevState: UploadObjetivosResult | null,
  formData: FormData,
): Promise<UploadObjetivosResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const allowWithAlerts =
    String(formData.get("allow_with_alerts") ?? "").trim().toLowerCase() === "true";
  const changeNote = String(formData.get("change_note") ?? "").trim();

  const preview = await runPreview({ formData });
  if (!preview.ok) return preview;

  if (!preview.summary.hasStatusData) {
    return {
      ok: false,
      message: "No hay rutas activas en sales_force_status para el periodo seleccionado.",
    };
  }

  if (!preview.summary.hasRuleDefinitions) {
    return {
      ok: false,
      message: "No hay reglas versionadas para el periodo. Sin eso no se puede medir cobertura requerida.",
    };
  }

  if (preview.validRowsForInsert.length === 0) {
    return {
      ok: false,
      message: "No hay filas validas para guardar.",
    };
  }

  const hasAlerts = preview.summary.warningCount > 0 || preview.summary.criticalCount > 0;
  if (hasAlerts && !allowWithAlerts) {
    return {
      ok: false,
      message:
        "El preview tiene alertas (criticos o advertencias). Confirma guardar con allow_with_alerts=true.",
    };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const versionLookup = await supabase
    .from("team_objective_target_versions")
    .select("version_no")
    .eq("period_month", preview.periodMonth)
    .order("version_no", { ascending: false })
    .limit(1);

  if (versionLookup.error) {
    if (isMissingRelationError(versionLookup.error)) {
      const tableName =
        getMissingRelationName(versionLookup.error) ?? "team_objective_target_versions";
      return {
        ok: false,
        message: `No existe ${tableName}. Ejecuta docs/team-objectives-schema.sql antes de guardar.`,
      };
    }
    return {
      ok: false,
      message: `No se pudo obtener version actual: ${versionLookup.error.message}`,
    };
  }

  const currentVersionNo = Number(versionLookup.data?.[0]?.version_no ?? 0);
  const nextVersionNo = Number.isFinite(currentVersionNo) ? currentVersionNo + 1 : 1;

  const insertVersionResult = await supabase
    .from("team_objective_target_versions")
    .insert({
      period_month: preview.periodMonth,
      version_no: nextVersionNo,
      source_file_name: preview.uploadedFileName,
      sheet_name: preview.sheetName || null,
      change_note: changeNote || null,
      total_rows: preview.summary.parsedRows,
      valid_rows: preview.summary.validRows,
      invalid_rows: preview.summary.invalidRows,
      missing_required_count: preview.summary.missingRequiredCount,
      summary: preview.summary,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertVersionResult.error) {
    if (isMissingRelationError(insertVersionResult.error)) {
      const tableName =
        getMissingRelationName(insertVersionResult.error) ?? "team_objective_target_versions";
      return {
        ok: false,
        message: `No existe ${tableName}. Ejecuta docs/team-objectives-schema.sql antes de guardar.`,
      };
    }
    return {
      ok: false,
      message: `No se pudo crear version de objetivos: ${insertVersionResult.error.message}`,
    };
  }

  const versionId = String(insertVersionResult.data?.id ?? "").trim();
  if (!versionId) {
    return { ok: false, message: "No se obtuvo version_id al guardar objetivos." };
  }

  const insertRowsPayload = preview.validRowsForInsert.map((row) => ({
    version_id: versionId,
    period_month: preview.periodMonth,
    team_id: row.teamId,
    territorio_individual: row.territorioIndividual,
    product_name: row.productName,
    metodo: row.metodo,
    plan_type_name: row.planTypeName,
    target: row.target,
    brick: row.brick,
    cuenta: row.cuenta,
    canal: row.canal,
    producto: row.producto,
    sales_credity: row.salesCredity,
    periodo_string: row.periodoString,
    periodo: row.periodo,
    source_row_number: row.rowNumber,
  }));

  let insertRowsError: { code?: string; message?: string } | null = null;
  const insertRowsWithMetodoResult = await supabase.from("team_objective_targets").insert(insertRowsPayload);
  insertRowsError = insertRowsWithMetodoResult.error;

  if (insertRowsError && String(insertRowsError.message ?? "").toLowerCase().includes("metodo")) {
    const legacyPayload = insertRowsPayload.map((row) => {
      const legacyRow = { ...row };
      delete (legacyRow as { metodo?: string }).metodo;
      return legacyRow;
    });
    const insertRowsLegacyResult = await supabase.from("team_objective_targets").insert(legacyPayload);
    insertRowsError = insertRowsLegacyResult.error;
  }

  if (insertRowsError) {
    if (isLegacyObjectiveUniqueConstraintError(insertRowsError)) {
      return {
        ok: false,
        message:
          "La base aun tiene la constraint unica vieja (version_id + territorio_individual + product_name). Ejecuta docs/team-objectives-schema.sql para migrar a la constraint con brick y cuenta.",
      };
    }
    if (isMissingRelationError(insertRowsError)) {
      const tableName = getMissingRelationName(insertRowsError) ?? "team_objective_targets";
      return {
        ok: false,
        message: `No existe ${tableName}. Ejecuta docs/team-objectives-schema.sql antes de guardar.`,
      };
    }
    return {
      ok: false,
      message: `No se pudieron guardar filas de objetivos: ${insertRowsError.message}`,
    };
  }

  revalidatePath("/admin/objetivos");
  revalidateTag("admin-objetivos", "max");

  return {
    ok: true,
    message: `Version ${nextVersionNo} guardada. Filas validas: ${preview.summary.validRows}. Criticos detectados: ${preview.summary.criticalCount}. Advertencias: ${preview.summary.warningCount}.`,
    periodMonth: preview.periodMonth,
    versionNo: nextVersionNo,
    versionId,
    summary: {
      validRows: preview.summary.validRows,
      invalidRows: preview.summary.invalidRows,
      missingRequiredCount: preview.summary.missingRequiredCount,
    },
  };
}
