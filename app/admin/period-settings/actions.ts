"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMissingRelationName,
  isMissingRelationError,
} from "@/lib/admin/incentive-rules/shared";
import { normalizeProductNameKey } from "@/lib/admin/period-settings/effective-period";
import { GLOBAL_PERIOD_SETTINGS_MONTH } from "@/lib/admin/period-settings/load-period-settings";

type ActionState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | null;

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

function parseBooleanField(value: FormDataEntryValue | null): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "on" || raw === "true" || raw === "1" || raw === "activo";
}

function parseCutoffDay(value: FormDataEntryValue | null): number | null {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return null;
  const day = Math.trunc(parsed);
  if (day < 1 || day > 31) return null;
  return day;
}

function parseAffectedProductNames(formData: FormData): string[] {
  const rawJson = String(formData.get("affected_product_names_json") ?? "").trim();
  const values: string[] = [];

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) values.push(String(item ?? ""));
      }
    } catch {
      // Fall back to repeated form fields below.
    }
  }

  for (const value of formData.getAll("affected_product_names")) {
    values.push(String(value ?? ""));
  }

  const byKey = new Map<string, string>();
  for (const value of values) {
    const productName = value.trim();
    const key = normalizeProductNameKey(productName);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, productName);
  }

  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}

export async function savePeriodSettingsAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No tienes permisos para guardar Period Settings." };
  }

  const resultFromHireDateEnabled = parseBooleanField(formData.get("result_from_hire_date_enabled"));
  const hireDateCutoffDay = parseCutoffDay(formData.get("hire_date_cutoff_day"));
  if (hireDateCutoffDay === null) {
    return { ok: false, message: "El dia de corte debe estar entre 1 y 31." };
  }

  const affectedProductNames = parseAffectedProductNames(formData);
  if (resultFromHireDateEnabled && affectedProductNames.length === 0) {
    return {
      ok: false,
      message: "Selecciona al menos un product_name afectado antes de activar el feature.",
    };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const result = await supabase
    .from("team_incentive_period_settings")
    .upsert(
      {
        period_month: GLOBAL_PERIOD_SETTINGS_MONTH,
        result_from_hire_date_enabled: resultFromHireDateEnabled,
        hire_date_cutoff_day: hireDateCutoffDay,
        affected_product_names: affectedProductNames,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "period_month" },
    );

  if (result.error) {
    if (isMissingRelationError(result.error)) {
      const tableName = getMissingRelationName(result.error) ?? "team_incentive_period_settings";
      return {
        ok: false,
        message: `La tabla ${tableName} no existe. Ejecuta docs/team-incentive-period-settings-schema.sql.`,
      };
    }
    return { ok: false, message: `No se pudo guardar Period Settings: ${result.error.message}` };
  }

  revalidatePath("/admin/period-settings");
  revalidatePath("/admin/calculo");
  revalidateTag("admin-calculo", "max");

  return {
    ok: true,
    message: resultFromHireDateEnabled
      ? `Period Settings guardado: corte dia ${hireDateCutoffDay}, ${affectedProductNames.length} producto(s) afectado(s).`
      : "Period Settings guardado: feature inactivo.",
  };
}
