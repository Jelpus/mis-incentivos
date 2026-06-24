"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { isAdminRole } from "@/lib/auth/impersonation";
import { getMissingRelationName, isMissingRelationError, normalizePeriodMonthInput } from "@/lib/admin/incentive-rules/shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeAdjustmentProduct, periodCodeToMonth } from "@/lib/ranking-contests/pointAdjustments";

type RankingAdjustmentActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parsePoints(value: unknown): number | null {
  const raw = normalizeText(value).replace(/,/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveDeltaPoints(params: {
  operation: string;
  pointsValue: number | null;
  basePoints: number | null;
  fallbackDelta: number | null;
}): number | null {
  if (!params.operation && params.fallbackDelta !== null) return params.fallbackDelta;
  if (params.pointsValue === null) return null;

  if (params.operation === "subtract") return -Math.abs(params.pointsValue);
  if (params.operation === "set") {
    if (params.basePoints === null) return null;
    return params.pointsValue - params.basePoints;
  }

  return Math.abs(params.pointsValue);
}

function normalizePeriodInput(value: unknown): string | null {
  return normalizePeriodMonthInput(normalizeText(value)) ?? periodCodeToMonth(value);
}

function tableMissingMessage(error: { message?: string } | null) {
  const tableName = getMissingRelationName(error) ?? "ranking_point_adjustments";
  return `No existe la tabla ${tableName}. Ejecuta docs/ranking-point-adjustments-schema.sql.`;
}

function revalidateRankingAdjustments() {
  revalidatePath("/admin/ajustes-ranking");
  revalidatePath("/perfil/ranking");
  revalidateTag("ranking-contests", "max");
}

export async function upsertRankingPointAdjustmentAction(
  _prevState: RankingAdjustmentActionResult | null,
  formData: FormData,
): Promise<RankingAdjustmentActionResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const adjustmentId = normalizeText(formData.get("adjustment_id"));
  const periodMonth = normalizePeriodInput(formData.get("period_month"));
  const territory = normalizeText(formData.get("territory"));
  const productName = normalizeAdjustmentProduct(formData.get("product_name"));
  const operation = normalizeText(formData.get("operation"));
  const pointsValue = parsePoints(formData.get("points_value"));
  const basePoints = parsePoints(formData.get("base_points"));
  const fallbackDelta = parsePoints(formData.get("delta_points"));
  const deltaPoints = resolveDeltaPoints({
    operation,
    pointsValue,
    basePoints,
    fallbackDelta,
  });
  const reason = normalizeText(formData.get("reason")) || null;

  if (!periodMonth) return { ok: false, message: "Periodo invalido." };
  if (!territory) return { ok: false, message: "Territorio requerido." };
  if (!productName) return { ok: false, message: "Producto requerido." };
  if (deltaPoints === null) return { ok: false, message: "Delta de puntos invalido." };

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Admin client no disponible." };

  const payload = {
    period_month: periodMonth,
    territory,
    product_name: productName,
    delta_points: deltaPoints,
    reason,
    is_active: true,
    updated_by: user.id,
  };

  const result = adjustmentId
    ? await supabase
      .from("ranking_point_adjustments")
      .update(payload)
      .eq("id", adjustmentId)
      .select("id")
      .maybeSingle()
    : await supabase
      .from("ranking_point_adjustments")
      .upsert(
        {
          ...payload,
          created_by: user.id,
        },
        { onConflict: "period_month,territory,product_name" },
      )
      .select("id")
      .maybeSingle();

  if (result.error) {
    if (isMissingRelationError(result.error)) return { ok: false, message: tableMissingMessage(result.error) };
    return { ok: false, message: `No se pudo guardar ajuste ranking: ${result.error.message}` };
  }

  revalidateRankingAdjustments();
  return { ok: true, message: adjustmentId ? "Ajuste ranking actualizado." : "Ajuste ranking guardado." };
}

export async function deleteRankingPointAdjustmentAction(
  _prevState: RankingAdjustmentActionResult | null,
  formData: FormData,
): Promise<RankingAdjustmentActionResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const adjustmentId = normalizeText(formData.get("adjustment_id"));
  if (!adjustmentId) return { ok: false, message: "adjustment_id requerido." };

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Admin client no disponible." };

  const result = await supabase
    .from("ranking_point_adjustments")
    .update({
      is_active: false,
      updated_by: user.id,
    })
    .eq("id", adjustmentId);

  if (result.error) {
    if (isMissingRelationError(result.error)) return { ok: false, message: tableMissingMessage(result.error) };
    return { ok: false, message: `No se pudo desactivar ajuste ranking: ${result.error.message}` };
  }

  revalidateRankingAdjustments();
  return { ok: true, message: "Ajuste ranking desactivado." };
}
