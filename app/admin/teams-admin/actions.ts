"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { isAdminRole } from "@/lib/auth/impersonation";
import { getMissingRelationName, isMissingRelationError } from "@/lib/admin/incentive-rules/shared";
import { createAdminClient } from "@/lib/supabase/admin";

type UpsertTeamAdminAssignmentsResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function upsertTeamAdminAssignmentsAction(
  _prevState: UpsertTeamAdminAssignmentsResult | null,
  formData: FormData,
): Promise<UpsertTeamAdminAssignmentsResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const rawTeamIds = formData.getAll("team_ids[]").map((item) => normalizeText(item));
  const rawAdminUserIds = formData.getAll("admin_user_ids[]").map((item) => normalizeText(item));

  if (rawTeamIds.length !== rawAdminUserIds.length) {
    return { ok: false, message: "No se pudo procesar el formulario de asignaciones." };
  }

  const teamIds = Array.from(new Set(rawTeamIds.filter((value) => value.length > 0)));
  if (teamIds.length === 0) {
    return { ok: false, message: "No hay team_id para guardar." };
  }

  const latestAssignments = new Map<string, string>();
  for (let index = 0; index < rawTeamIds.length; index += 1) {
    const teamId = rawTeamIds[index];
    const adminUserId = rawAdminUserIds[index];
    if (!teamId) continue;

    if (adminUserId) {
      latestAssignments.set(teamId, adminUserId);
    } else {
      latestAssignments.delete(teamId);
    }
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Admin client no disponible." };
  }

  const clearResult = await supabase
    .from("team_admin_assignments")
    .delete()
    .in("team_id", teamIds);

  if (clearResult.error) {
    if (isMissingRelationError(clearResult.error)) {
      const tableName = getMissingRelationName(clearResult.error) ?? "team_admin_assignments";
      return {
        ok: false,
        message: `No existe la tabla ${tableName}. Ejecuta docs/teams-admin-schema.sql.`,
      };
    }
    return {
      ok: false,
      message: `No se pudo limpiar asignaciones: ${clearResult.error.message}`,
    };
  }

  const rowsToInsert = Array.from(latestAssignments.entries()).map(([teamId, adminUserId]) => ({
    team_id: teamId,
    admin_user_id: adminUserId,
    updated_by: user.id,
  }));

  if (rowsToInsert.length > 0) {
    const insertResult = await supabase.from("team_admin_assignments").insert(rowsToInsert);

    if (insertResult.error) {
      if (isMissingRelationError(insertResult.error)) {
        const tableName = getMissingRelationName(insertResult.error) ?? "team_admin_assignments";
        return {
          ok: false,
          message: `No existe la tabla ${tableName}. Ejecuta docs/teams-admin-schema.sql.`,
        };
      }
      return {
        ok: false,
        message: `No se pudo guardar asignaciones: ${insertResult.error.message}`,
      };
    }
  }

  revalidatePath("/admin/teams-admin");
  return {
    ok: true,
    message: `Asignaciones guardadas. Equipos con admin: ${rowsToInsert.length}.`,
  };
}
