import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMissingRelationName,
  isMissingRelationError,
} from "@/lib/admin/incentive-rules/shared";
import type { PayCurvePoint } from "@/lib/admin/pay-curves/catalog";

type PayCurveHeaderRow = {
  id: string;
  curve_code: string;
  curve_name: string;
  curve_description: string | null;
  is_active: boolean;
  is_hidden: boolean;
  updated_at: string;
  created_at: string;
};

export type PayCurveListRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isHidden: boolean;
  pointsCount: number;
  updatedAt: string;
  createdAt: string;
};

export type PayCurveDetail = {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  isHidden: boolean;
  points: PayCurvePoint[];
};

async function loadPayCurvesListData(): Promise<
  | { ok: true; rows: PayCurveListRow[] }
  | { ok: false; message: string; rows: [] }
> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible.", rows: [] };
  }

  const curvesResult = await supabase
    .from("team_incentive_pay_curves")
    .select("id, curve_code, curve_name, curve_description, is_active, is_hidden, updated_at, created_at")
    .order("created_at", { ascending: false });

  if (curvesResult.error) {
    if (isMissingRelationError(curvesResult.error)) {
      const tableName = getMissingRelationName(curvesResult.error) ?? "team_incentive_pay_curves";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-pay-curves-schema.sql para crearla.`,
        rows: [],
      };
    }
    return { ok: false, message: `No se pudo consultar curvas: ${curvesResult.error.message}`, rows: [] };
  }

  const headers = (curvesResult.data ?? []) as PayCurveHeaderRow[];
  if (headers.length === 0) {
    return { ok: true, rows: [] };
  }

  const ids = headers.map((row) => row.id);
  const pointsResult = await supabase
    .from("team_incentive_pay_curve_points")
    .select("curve_id")
    .in("curve_id", ids);

  if (pointsResult.error) {
    if (isMissingRelationError(pointsResult.error)) {
      const tableName =
        getMissingRelationName(pointsResult.error) ?? "team_incentive_pay_curve_points";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-pay-curves-schema.sql para crearla.`,
        rows: [],
      };
    }
    return { ok: false, message: `No se pudieron consultar puntos: ${pointsResult.error.message}`, rows: [] };
  }

  const pointsCountByCurve = new Map<string, number>();
  for (const point of pointsResult.data ?? []) {
    const curveId = String((point as { curve_id?: unknown }).curve_id ?? "");
    if (!curveId) continue;
    pointsCountByCurve.set(curveId, (pointsCountByCurve.get(curveId) ?? 0) + 1);
  }

  return {
    ok: true,
    rows: headers.map((row) => ({
      id: row.id,
      code: row.curve_code,
      name: row.curve_name,
      description: row.curve_description,
      isActive: row.is_active,
      isHidden: row.is_hidden,
      pointsCount: pointsCountByCurve.get(row.id) ?? 0,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    })),
  };
}

const getCachedPayCurvesListData = unstable_cache(
  async () => loadPayCurvesListData(),
  ["admin-pay-curves-list"],
  { revalidate: 300, tags: ["admin-pay-curves"] },
);

export async function getPayCurvesListData(): Promise<
  | { ok: true; rows: PayCurveListRow[] }
  | { ok: false; message: string; rows: [] }
> {
  return getCachedPayCurvesListData();
}

export async function getPayCurveDetailData(curveId: string): Promise<
  | { ok: true; row: PayCurveDetail }
  | { ok: false; message: string }
> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const headerResult = await supabase
    .from("team_incentive_pay_curves")
    .select("id, curve_code, curve_name, curve_description, is_active, is_hidden")
    .eq("id", curveId)
    .single();

  if (headerResult.error) {
    if (isMissingRelationError(headerResult.error)) {
      const tableName = getMissingRelationName(headerResult.error) ?? "team_incentive_pay_curves";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-pay-curves-schema.sql para crearla.`,
      };
    }
    return { ok: false, message: `No se pudo consultar curva: ${headerResult.error.message}` };
  }

  const pointsResult = await supabase
    .from("team_incentive_pay_curve_points")
    .select("row_no, cobertura, pago")
    .eq("curve_id", curveId)
    .order("row_no", { ascending: true });

  if (pointsResult.error) {
    if (isMissingRelationError(pointsResult.error)) {
      const tableName =
        getMissingRelationName(pointsResult.error) ?? "team_incentive_pay_curve_points";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Revisa docs/team-incentive-pay-curves-schema.sql para crearla.`,
      };
    }
    return { ok: false, message: `No se pudieron consultar puntos: ${pointsResult.error.message}` };
  }

  const header = headerResult.data as {
    id: string;
    curve_code: string;
    curve_name: string;
    curve_description: string | null;
    is_active: boolean;
    is_hidden: boolean;
  };

  const points = (pointsResult.data ?? []).map((row) => ({
    cobertura: Number((row as { cobertura?: unknown }).cobertura ?? 0),
    pago: Number((row as { pago?: unknown }).pago ?? 0),
  }));

  return {
    ok: true,
    row: {
      id: header.id,
      code: header.curve_code,
      name: header.curve_name,
      description: header.curve_description ?? "",
      isActive: header.is_active,
      isHidden: header.is_hidden,
      points,
    },
  };
}
