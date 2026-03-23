"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMissingRelationName,
  isMissingRelationError,
  normalizeSourceFileCode,
} from "@/lib/admin/incentive-rules/shared";

type PayCurvePoint = {
  cobertura: number;
  pago: number;
};

type SavePayCurveInput = {
  name: string;
  description: string;
  points: PayCurvePoint[];
};

type UpdatePayCurveInput = {
  curveId: string;
  name: string;
  description: string;
  points: PayCurvePoint[];
};

export type SavePayCurveResult =
  | {
      ok: true;
      message: string;
      curveId: string;
      curveCode: string;
    }
  | {
      ok: false;
      message: string;
    };

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

function validatePoints(points: PayCurvePoint[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(points) || points.length < 2) {
    errors.push("Debes incluir al menos 2 puntos en la curva.");
    return errors;
  }

  let previousCoverage = -Infinity;
  const seenCoverage = new Set<number>();

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!Number.isFinite(point?.cobertura)) {
      errors.push(`Punto ${index + 1}: cobertura invalida.`);
      continue;
    }
    if (!Number.isFinite(point?.pago)) {
      errors.push(`Punto ${index + 1}: pago invalido.`);
      continue;
    }
    if (point.cobertura < previousCoverage) {
      errors.push(`Punto ${index + 1}: cobertura debe ir en orden ascendente.`);
    }
    if (seenCoverage.has(point.cobertura)) {
      errors.push(`Punto ${index + 1}: cobertura repetida.`);
    }
    previousCoverage = point.cobertura;
    seenCoverage.add(point.cobertura);
  }

  return errors;
}

export async function savePayCurveAction(input: SavePayCurveInput): Promise<SavePayCurveResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const name = String(input.name ?? "").trim();
  const description = String(input.description ?? "").trim();
  const points = Array.isArray(input.points) ? input.points : [];

  if (!name) {
    return { ok: false, message: "El nombre de la curva es obligatorio." };
  }

  const validationErrors = validatePoints(points);
  if (validationErrors.length > 0) {
    return { ok: false, message: validationErrors[0] ?? "Curva invalida." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const curveCode = normalizeSourceFileCode(name).slice(0, 80) || `curva_${Date.now()}`;

  const insertResult = await supabase
    .from("team_incentive_pay_curves")
    .insert({
      curve_code: curveCode,
      curve_name: name,
      curve_description: description || null,
      is_active: false,
      is_hidden: false,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id, curve_code")
    .single();

  if (insertResult.error) {
    if (isMissingRelationError(insertResult.error)) {
      const tableName =
        getMissingRelationName(insertResult.error) ?? "team_incentive_pay_curves";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-pay-curves-schema.sql para crearla.`,
      };
    }

    if (insertResult.error.code === "23505") {
      return {
        ok: false,
        message:
          "Ya existe una curva con un codigo similar. Cambia el nombre o agrega un sufijo distintivo.",
      };
    }

    return {
      ok: false,
      message: `No se pudo guardar la curva: ${insertResult.error.message}`,
    };
  }

  const curveId = String(insertResult.data.id);
  const pointsInsertResult = await supabase
    .from("team_incentive_pay_curve_points")
    .insert(
      points.map((point, index) => ({
        curve_id: curveId,
        row_no: index + 1,
        cobertura: point.cobertura,
        pago: point.pago,
      })),
    );

  if (pointsInsertResult.error) {
    // Rollback basico en caso de fallo de detalle.
    await supabase.from("team_incentive_pay_curves").delete().eq("id", curveId);

    if (isMissingRelationError(pointsInsertResult.error)) {
      const tableName =
        getMissingRelationName(pointsInsertResult.error) ?? "team_incentive_pay_curve_points";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-pay-curves-schema.sql para crearla.`,
      };
    }

    return {
      ok: false,
      message: `No se pudieron guardar los puntos de la curva: ${pointsInsertResult.error.message}`,
    };
  }

  revalidatePath("/admin/curvas-de-pago");
  return {
    ok: true,
    message: "Curva guardada correctamente.",
    curveId,
    curveCode: String(insertResult.data.curve_code ?? curveCode),
  };
}

export async function updatePayCurveAction(input: UpdatePayCurveInput): Promise<SavePayCurveResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const curveId = String(input.curveId ?? "").trim();
  const name = String(input.name ?? "").trim();
  const description = String(input.description ?? "").trim();
  const points = Array.isArray(input.points) ? input.points : [];

  if (!curveId) {
    return { ok: false, message: "Falta curveId para actualizar." };
  }
  if (!name) {
    return { ok: false, message: "El nombre de la curva es obligatorio." };
  }

  const validationErrors = validatePoints(points);
  if (validationErrors.length > 0) {
    return { ok: false, message: validationErrors[0] ?? "Curva invalida." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const curveCode = normalizeSourceFileCode(name).slice(0, 80) || `curva_${Date.now()}`;

  const updateResult = await supabase
    .from("team_incentive_pay_curves")
    .update({
      curve_code: curveCode,
      curve_name: name,
      curve_description: description || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", curveId)
    .select("id, curve_code")
    .single();

  if (updateResult.error) {
    if (isMissingRelationError(updateResult.error)) {
      const tableName =
        getMissingRelationName(updateResult.error) ?? "team_incentive_pay_curves";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-pay-curves-schema.sql para crearla.`,
      };
    }
    if (updateResult.error.code === "23505") {
      return {
        ok: false,
        message:
          "Ya existe una curva con un codigo similar. Cambia el nombre o agrega un sufijo distintivo.",
      };
    }
    return {
      ok: false,
      message: `No se pudo actualizar la curva: ${updateResult.error.message}`,
    };
  }

  const deletePointsResult = await supabase
    .from("team_incentive_pay_curve_points")
    .delete()
    .eq("curve_id", curveId);

  if (deletePointsResult.error) {
    if (isMissingRelationError(deletePointsResult.error)) {
      const tableName =
        getMissingRelationName(deletePointsResult.error) ?? "team_incentive_pay_curve_points";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-pay-curves-schema.sql para crearla.`,
      };
    }
    return {
      ok: false,
      message: `No se pudieron reemplazar puntos previos: ${deletePointsResult.error.message}`,
    };
  }

  const pointsInsertResult = await supabase
    .from("team_incentive_pay_curve_points")
    .insert(
      points.map((point, index) => ({
        curve_id: curveId,
        row_no: index + 1,
        cobertura: point.cobertura,
        pago: point.pago,
      })),
    );

  if (pointsInsertResult.error) {
    if (isMissingRelationError(pointsInsertResult.error)) {
      const tableName =
        getMissingRelationName(pointsInsertResult.error) ?? "team_incentive_pay_curve_points";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-pay-curves-schema.sql para crearla.`,
      };
    }
    return {
      ok: false,
      message: `No se pudieron guardar los puntos de la curva: ${pointsInsertResult.error.message}`,
    };
  }

  revalidatePath("/admin/curvas-de-pago");
  revalidatePath(`/admin/curvas-de-pago/${encodeURIComponent(curveId)}/editar`);

  return {
    ok: true,
    message: "Curva actualizada correctamente.",
    curveId,
    curveCode: String(updateResult.data.curve_code ?? curveCode),
  };
}
