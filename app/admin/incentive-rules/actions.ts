"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import {
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";

type SaveTeamRuleResult =
  | {
      ok: true;
      message: string;
      versionNo: number;
    }
  | {
      ok: false;
      message: string;
    };

function isAdminRole(role: string | null, isActive: boolean | null): boolean {
  return isActive !== false && (role === "admin" || role === "super_admin");
}

export async function saveTeamIncentiveRuleVersionAction(
  _prevState: SaveTeamRuleResult | null,
  formData: FormData,
): Promise<SaveTeamRuleResult> {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user || !isAdminRole(role, isActive)) {
    return {
      ok: false,
      message: "No autorizado.",
    };
  }

  const teamId = String(formData.get("team_id") ?? "").trim();
  const periodInput = String(formData.get("period_month") ?? "").trim();
  const changeNote = String(formData.get("change_note") ?? "").trim();
  const ruleDefinitionInput = String(formData.get("rule_definition") ?? "").trim();

  if (!teamId) {
    return {
      ok: false,
      message: "Falta team_id.",
    };
  }

  const periodMonth = normalizePeriodMonthInput(periodInput);
  if (!periodMonth) {
    return {
      ok: false,
      message: "Periodo invalido. Usa formato YYYY-MM.",
    };
  }

  if (!ruleDefinitionInput) {
    return {
      ok: false,
      message: "Debes ingresar una definicion JSON para las reglas.",
    };
  }

  let parsedDefinition: unknown;
  try {
    parsedDefinition = JSON.parse(ruleDefinitionInput);
  } catch {
    return {
      ok: false,
      message: "El JSON de reglas no es valido.",
    };
  }

  if (!parsedDefinition || typeof parsedDefinition !== "object" || Array.isArray(parsedDefinition)) {
    return {
      ok: false,
      message: "La definicion de reglas debe ser un objeto JSON.",
    };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return {
      ok: false,
      message: "Admin client no disponible.",
    };
  }

  const teamValidationResult = await supabase
    .from("sales_force_status")
    .select("id", { count: "exact", head: true })
    .eq("period_month", periodMonth)
    .eq("is_deleted", false)
    .eq("team_id", teamId);

  if (teamValidationResult.error) {
    return {
      ok: false,
      message: `No se pudo validar el team en status: ${teamValidationResult.error.message}`,
    };
  }

  if ((teamValidationResult.count ?? 0) <= 0) {
    return {
      ok: false,
      message: "Ese team_id no existe en Status para el periodo seleccionado.",
    };
  }

  const latestVersionResult = await supabase
    .from("team_incentive_rule_versions")
    .select("version_no")
    .eq("period_month", periodMonth)
    .eq("team_id", teamId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestVersionResult.error) {
    if (isMissingRelationError(latestVersionResult.error)) {
      return {
        ok: false,
        message:
          "No existe la tabla team_incentive_rule_versions. Revisa docs/team-incentive-rules-schema.sql para crearla.",
      };
    }

    return {
      ok: false,
      message: `No se pudo leer la version actual: ${latestVersionResult.error.message}`,
    };
  }

  const currentVersionNo = Number(latestVersionResult.data?.version_no ?? 0);
  const nextVersionNo = Number.isFinite(currentVersionNo) ? currentVersionNo + 1 : 1;

  const insertResult = await supabase
    .from("team_incentive_rule_versions")
    .insert({
      period_month: periodMonth,
      team_id: teamId,
      version_no: nextVersionNo,
      change_note: changeNote || null,
      rule_definition: parsedDefinition as Record<string, unknown>,
      source_type: "manual",
      created_by: user.id,
    });

  if (insertResult.error) {
    if (isMissingRelationError(insertResult.error)) {
      return {
        ok: false,
        message:
          "No existe la tabla team_incentive_rule_versions. Revisa docs/team-incentive-rules-schema.sql para crearla.",
      };
    }

    return {
      ok: false,
      message: `No se pudo guardar la nueva version: ${insertResult.error.message}`,
    };
  }

  revalidatePath("/admin/incentive-rules");
  revalidatePath(`/admin/incentive-rules/${encodeURIComponent(teamId)}`);

  return {
    ok: true,
    message: `Version ${nextVersionNo} guardada correctamente.`,
    versionNo: nextVersionNo,
  };
}
