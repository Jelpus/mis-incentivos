"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMissingRelationName, isMissingRelationError, normalizePeriodMonthInput } from "@/lib/admin/incentive-rules/shared";
import { runCalculoProcess } from "@/lib/admin/calculo/run-calculo-process";
import { buildResultadosV2Preview, buildResultadosV2PreviewWithOptions } from "@/lib/admin/calculo/build-resultados-v2-preview";
import { persistResultadosV2 } from "@/lib/admin/calculo/persist-resultados-v2";
import type { CalculoProcessRunResult } from "@/lib/admin/calculo/run-calculo-process";
import type { ResultadosV2PreviewResult } from "@/lib/admin/calculo/build-resultados-v2-preview";

const CALCULO_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedCalculoState = {
  expiresAt: number;
  processPreview: CalculoProcessRunResult | null;
  resultadosPreview: ResultadosV2PreviewResult | null;
};

const calculoCache = new Map<string, CachedCalculoState>();

function cacheKey(userId: string, periodMonth: string): string {
  return `${userId}::${periodMonth}`;
}

function getCachedState(userId: string, periodMonth: string): CachedCalculoState | null {
  const key = cacheKey(userId, periodMonth);
  const cached = calculoCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    calculoCache.delete(key);
    return null;
  }
  return cached;
}

function setCachedState(userId: string, periodMonth: string, next: Partial<CachedCalculoState>): void {
  const key = cacheKey(userId, periodMonth);
  const current = getCachedState(userId, periodMonth);
  calculoCache.set(key, {
    expiresAt: Date.now() + CALCULO_CACHE_TTL_MS,
    processPreview: next.processPreview ?? current?.processPreview ?? null,
    resultadosPreview: next.resultadosPreview ?? current?.resultadosPreview ?? null,
  });
}

function clearCachedState(userId: string, periodMonth: string): void {
  calculoCache.delete(cacheKey(userId, periodMonth));
}

export type CalculoActionResult =
  | {
    ok: true;
    message: string;
    periodMonth: string;
    nextStatus: "borrador" | "precalculo" | "final" | "publicado";
    calculationSummary?: {
      assignmentsCount: number;
      productsEvaluated: number;
      exactMatches: number;
      fuzzyMatches: number;
      totalObjetivo: number;
      totalValor: number;
      totalResultado: number;
    };
  }
  | { ok: false; message: string };

export type CalculoPreviewResult =
  | {
    ok: true;
    message: string;
    periodMonth: string;
    summary: {
      assignmentsCount: number;
      productsEvaluated: number;
      exactMatches: number;
      fuzzyMatches: number;
      totalObjetivo: number;
      totalValor: number;
      totalResultado: number;
    };
    previewRows: Array<{
      ruta: string;
      teamid: string;
      plan: string;
      plan_type_name: string | null;
      archivo: string | null;
      fuente: string | null;
      metric: string | null;
      molecula_producto: string | null;
      brick: string | null;
      cuenta: string | null;
      encontrar: "brick" | "estado" | "global";
      peso: number;
      objetivo: number;
      valor: number;
      resultado: number;
      cobertura: number;
      match_mode: "exact" | "fuzzy" | "none";
      none_reason: string | null;
      objective_block: "private" | "drilldown_cuentas" | "drilldown_estados" | "otros";
    }>;
  }
  | { ok: false; message: string };

export type ResultadosV2PreviewActionResult =
  | {
    ok: true;
    message: string;
    periodMonth: string;
    summary: {
      assignmentsCount: number;
      rowsCount: number;
      totalObjetivo: number;
      totalResultado: number;
      totalPagoVariable: number;
      totalPagoResultado: number;
      garantiasAplicadas: number;
    };
    rows: Array<{
      team_id: string;
      plan_type_name: string | null;
      product_name: string;
      prod_weight: number;
      agrupador: string | null;
      garantia: boolean;
      elemento: string | null;
      ruta: string;
      representante: string;
      actual: number;
      resultado: number;
      objetivo: number;
      cobertura: number;
      pagovariable: number;
      coberturapago: number;
      nombre: string | null;
      linea: string | null;
      manager: string | null;
      empleado: number | null;
      pagoresultado: number;
      periodo: string;
      curva_pago: string | null;
      brick: string | null;
      molecula: string | null;
      calcular_en_valores: boolean;
    }>;
    grouping_details: Array<{
      ruta: string;
      team_id: string;
      plan_type_name: string | null;
      agrupador: string | null;
      product_name_origen: string;
      product_name_final: string;
      calcular_en_valores: boolean;
      fue_agrupado: boolean;
      brick: string | null;
      molecula: string | null;
      precio_promedio: number;
      prod_weight: number;
      objetivo_unidades: number;
      resultado_unidades: number;
      objetivo_dinero: number;
      resultado_dinero: number;
      actual_dinero: number;
      cobertura: number;
    }>;
  }
  | { ok: false; message: string };

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

function resolveNextStatus(action: string): "borrador" | "precalculo" | "final" | "publicado" | null {
  if (action === "calcular") return "precalculo";
  if (action === "confirmar_precalculo") return "precalculo";
  if (action === "aprobar") return "final";
  if (action === "publicar") return "publicado";
  if (action === "despublicar") return "final";
  if (action === "ajustar") return "precalculo";
  return null;
}

function canTransition(currentStatus: string, action: string): boolean {
  if (action === "calcular") return true;
  if (action === "confirmar_precalculo") return currentStatus === "borrador" || currentStatus === "precalculo";
  if (currentStatus === "precalculo" && (action === "ajustar" || action === "aprobar")) return true;
  if (currentStatus === "final" && (action === "ajustar" || action === "publicar")) return true;
  if (currentStatus === "publicado" && action === "despublicar") return true;
  return false;
}

export async function updateCalculoStatusAction(
  _prevState: CalculoActionResult | null,
  formData: FormData,
): Promise<CalculoActionResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const periodInput = String(formData.get("period_month") ?? "").trim();
  const actionInput = String(formData.get("action") ?? "").trim().toLowerCase();
  const periodMonth = normalizePeriodMonthInput(periodInput);
  const nextStatus = resolveNextStatus(actionInput);

  if (!periodMonth) {
    return { ok: false, message: "Periodo invalido." };
  }
  if (!nextStatus) {
    return { ok: false, message: "Accion invalida." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const currentResult = await supabase
    .from("team_incentive_calculation_periods")
    .select("period_month, status")
    .eq("period_month", periodMonth)
    .maybeSingle<{ period_month: string; status: string | null }>();

  if (currentResult.error) {
    if (isMissingRelationError(currentResult.error)) {
      const tableName = getMissingRelationName(currentResult.error) ?? "team_incentive_calculation_periods";
      return {
        ok: false,
        message: `No existe ${tableName}. Ejecuta docs/team-incentive-calculation-periods-schema.sql`,
      };
    }
    return { ok: false, message: `No se pudo leer estatus actual: ${currentResult.error.message}` };
  }

  const currentStatus = String(currentResult.data?.status ?? "borrador").toLowerCase();
  if (!canTransition(currentStatus, actionInput)) {
    return {
      ok: false,
      message: `Transicion invalida: ${currentStatus} no permite accion ${actionInput}.`,
    };
  }

  const now = new Date().toISOString();
  const effectiveNextStatus =
    actionInput === "calcular"
      ? ((currentStatus as "borrador" | "precalculo" | "final" | "publicado") ?? "borrador")
      : nextStatus;
  const updatePayload: Record<string, unknown> = {
    period_month: periodMonth,
    status: effectiveNextStatus,
    updated_by: user.id,
    updated_at: now,
  };

  let calculationSummary:
    | {
      assignmentsCount: number;
      productsEvaluated: number;
      exactMatches: number;
      fuzzyMatches: number;
      totalObjetivo: number;
      totalValor: number;
      totalResultado: number;
    }
    | undefined;
  let resultadosPersistedSummary:
    | {
      rowsCount: number;
      totalPagoResultado: number;
      totalPagoVariable: number;
    }
    | undefined;

  if (actionInput === "calcular") {
    try {
      const t0 = Date.now();
      const cached = getCachedState(user.id, periodMonth);
      const processResult = cached?.processPreview ?? await runCalculoProcess(periodMonth, { persist: false });
      setCachedState(user.id, periodMonth, { processPreview: processResult });
      const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
      calculationSummary = {
        assignmentsCount: processResult.assignmentsCount,
        productsEvaluated: processResult.productsEvaluated,
        exactMatches: processResult.exactMatches,
        fuzzyMatches: processResult.fuzzyMatches,
        totalObjetivo: processResult.totalObjetivo,
        totalValor: processResult.totalValor,
        totalResultado: processResult.totalResultado,
      };
      // Precalienta preview 1.2 para que la UI responda mas rapido.
      if (!cached?.resultadosPreview) {
        const resultadosPreview = await buildResultadosV2PreviewWithOptions(periodMonth, {
          baseAssignments: processResult.previewRows as Array<{
            ruta: string;
            teamid: string;
            plan: string;
            plan_type_name: string | null;
            brick: string | null;
            molecula_producto: string | null;
            objetivo: number;
            valor: number;
            resultado: number;
          }>,
        });
        setCachedState(user.id, periodMonth, { resultadosPreview });
      }
      calculationSummary = { ...calculationSummary, _elapsedSec: Number(elapsedSec) } as typeof calculationSummary;
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? `No se pudo ejecutar Calcular: ${error.message}` : "No se pudo ejecutar Calcular.",
      };
    }
  }
  if (actionInput === "aprobar") {
    updatePayload.approved_at = now;
    updatePayload.finalized_at = now;
  }
  if (actionInput === "confirmar_precalculo") {
    try {
      // 1) Persistir primero asignacionUnidades (etapa 1.1)
      const processPersistResult = await runCalculoProcess(periodMonth, { persist: true });
      updatePayload.final_amount = processPersistResult.totalResultado;
      updatePayload.calculated_at = now;

      // 2) Persistir resultados_v2 (etapa 1.2)
      const prebuiltResultadosPreview = await buildResultadosV2PreviewWithOptions(periodMonth, {
        baseAssignments: processPersistResult.previewRows as Array<{
          ruta: string;
          teamid: string;
          plan: string;
          plan_type_name: string | null;
          brick: string | null;
          molecula_producto: string | null;
          objetivo: number;
          valor: number;
          resultado: number;
        }>,
      });
      resultadosPersistedSummary = await persistResultadosV2(periodMonth, prebuiltResultadosPreview);
      updatePayload.final_amount = resultadosPersistedSummary.totalPagoResultado;
      clearCachedState(user.id, periodMonth);
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? `No se pudo confirmar y subir resultados_v2: ${error.message}`
            : "No se pudo confirmar y subir resultados_v2.",
      };
    }
  }
  if (actionInput === "publicar") {
    updatePayload.published_at = now;
  }
  if (actionInput === "despublicar") {
    updatePayload.published_at = null;
  }

  const upsertResult = await supabase
    .from("team_incentive_calculation_periods")
    .upsert(updatePayload, { onConflict: "period_month" });

  if (upsertResult.error) {
    if (isMissingRelationError(upsertResult.error)) {
      const tableName = getMissingRelationName(upsertResult.error) ?? "team_incentive_calculation_periods";
      return {
        ok: false,
        message: `No existe ${tableName}. Ejecuta docs/team-incentive-calculation-periods-schema.sql`,
      };
    }
    return { ok: false, message: `No se pudo actualizar estatus: ${upsertResult.error.message}` };
  }

  revalidatePath("/admin/calculo");
  revalidateTag("admin-calculo", "max");

  return {
    ok: true,
    message:
      actionInput === "calcular" && calculationSummary
        ? `Calculo listo para revision (${periodMonth.slice(0, 7)}).`
        : actionInput === "confirmar_precalculo"
          ? `Confirmado (${periodMonth.slice(0, 7)}): asignacionUnidades y resultados_v2 subidos (${resultadosPersistedSummary?.rowsCount ?? 0} filas resultados_v2, pago_resultado=${(resultadosPersistedSummary?.totalPagoResultado ?? 0).toFixed(6)}). Estatus=${effectiveNextStatus}.`
          : `Periodo ${periodMonth.slice(0, 7)} actualizado a ${effectiveNextStatus}.`,
    periodMonth,
    nextStatus: effectiveNextStatus,
    calculationSummary,
  };
}

export async function previewCalculoProcessAction(
  _prevState: CalculoPreviewResult | null,
  formData: FormData,
): Promise<CalculoPreviewResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const periodInput = String(formData.get("period_month") ?? "").trim();
  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) {
    return { ok: false, message: "Periodo invalido." };
  }

  try {
    const cached = getCachedState(user.id, periodMonth);
    const preview = cached?.processPreview ?? await runCalculoProcess(periodMonth, { persist: false });
    setCachedState(user.id, periodMonth, { processPreview: preview });
    return {
      ok: true,
      message:
        `Preview Asignación (${periodMonth.slice(0, 7)})`,
      periodMonth,
      summary: {
        assignmentsCount: preview.assignmentsCount,
        productsEvaluated: preview.productsEvaluated,
        exactMatches: preview.exactMatches,
        fuzzyMatches: preview.fuzzyMatches,
        totalObjetivo: preview.totalObjetivo,
        totalValor: preview.totalValor,
        totalResultado: preview.totalResultado,
      },
      previewRows: preview.previewRows,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? `No se pudo generar preview: ${error.message}` : "No se pudo generar preview.",
    };
  }
}

export async function previewResultadosV2Action(
  _prevState: ResultadosV2PreviewActionResult | null,
  formData: FormData,
): Promise<ResultadosV2PreviewActionResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const periodInput = String(formData.get("period_month") ?? "").trim();
  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) {
    return { ok: false, message: "Periodo invalido." };
  }

  try {
    const cached = getCachedState(user.id, periodMonth);
    const preview =
      cached?.resultadosPreview ??
      await (cached?.processPreview
        ? buildResultadosV2PreviewWithOptions(periodMonth, {
          baseAssignments: cached.processPreview.previewRows as Array<{
            ruta: string;
            teamid: string;
            plan: string;
            plan_type_name: string | null;
            brick: string | null;
            molecula_producto: string | null;
            objetivo: number;
            valor: number;
            resultado: number;
          }>,
        })
        : buildResultadosV2Preview(periodMonth));
    setCachedState(user.id, periodMonth, { resultadosPreview: preview });
    return {
      ok: true,
      message:
        `Preview Resultados listo (${periodMonth.slice(0, 7)})`,
      periodMonth,
      summary: preview.summary,
      rows: preview.rows,
      grouping_details: preview.groupingDetails,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? `No se pudo generar preview resultados_v2: ${error.message}`
          : "No se pudo generar preview resultados_v2.",
    };
  }
}
