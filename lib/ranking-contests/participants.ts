import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContestParticipant } from "@/lib/ranking-contests/types";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function getContestParticipants(params: {
  supabase: SupabaseClient;
  maxCoveragePeriodMonth: string;
}): Promise<{ participants: ContestParticipant[]; message: string | null }> {
  const [salesResult, managersResult] = await Promise.all([
    params.supabase
      .from("sales_force_status")
      .select("*")
      .eq("period_month", params.maxCoveragePeriodMonth)
      .eq("is_deleted", false)
      .eq("is_active", true)
      .eq("is_vacant", false),
    params.supabase
      .from("manager_status")
      .select("*")
      .eq("period_month", params.maxCoveragePeriodMonth)
      .eq("is_deleted", false)
      .eq("is_active", true),
  ]);

  const messages: string[] = [];
  if (salesResult.error) messages.push(`No se pudieron cargar representantes: ${salesResult.error.message}`);
  if (managersResult.error) messages.push(`No se pudieron cargar managers: ${managersResult.error.message}`);

  const reps: ContestParticipant[] = ((salesResult.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const id = normalizeText(row.id) || `rep:${normalizeText(row.no_empleado) || normalizeText(row.territorio_individual)}`;
      const name = normalizeText(row.nombre_completo) || normalizeText(row.territorio_individual) || "Representante sin nombre";
      return {
        id,
        scope: "rep" as const,
        userId: normalizeText(row.user_id) || null,
        employeeNumber: row.no_empleado as string | number | null | undefined,
        email: normalizeText(row.profile_email) || normalizeText(row.correo_electronico) || null,
        name,
        territory: normalizeText(row.territorio_individual) || normalizeText(row.territorio_padre) || null,
        teamId: normalizeText(row.team_id) || null,
        rankingGroup: null,
        raw: row,
      };
    })
    .filter((row) => row.id && row.name);

  const managers: ContestParticipant[] = ((managersResult.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const id = normalizeText(row.id) || `manager:${normalizeText(row.no_empleado_manager) || normalizeText(row.territorio_manager)}`;
      const name = normalizeText(row.nombre_manager) || normalizeText(row.territorio_manager) || "Manager sin nombre";
      return {
        id,
        scope: "manager" as const,
        userId: normalizeText(row.user_id) || null,
        employeeNumber: row.no_empleado_manager as string | number | null | undefined,
        email: normalizeText(row.profile_email) || normalizeText(row.correo_manager) || null,
        name,
        territory: normalizeText(row.territorio_manager) || null,
        teamId: normalizeText(row.team_id) || null,
        rankingGroup: null,
        raw: row,
      };
    })
    .filter((row) => row.id && row.name);

  return {
    participants: [...reps, ...managers],
    message: messages.length > 0 ? messages.join(" ") : null,
  };
}
