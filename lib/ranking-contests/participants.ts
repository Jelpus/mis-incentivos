import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContestParticipant } from "@/lib/ranking-contests/types";

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 350;

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function formatRemoteErrorMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  const normalized = message.toLowerCase();

  if (
    normalized.includes("fetch failed") ||
    normalized.includes("econnreset") ||
    normalized.includes("authretryablefetcherror") ||
    normalized.includes("timeout")
  ) {
    return "problema temporal de conexion con Supabase";
  }

  return message || "error desconocido";
}

function isRetryableMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("fetch failed") ||
    normalized.includes("econnreset") ||
    normalized.includes("authretryablefetcherror") ||
    normalized.includes("timeout")
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryWithRetry<T extends { error: { message?: string } | null }>(
  run: () => PromiseLike<T>,
): Promise<T> {
  let lastResult = await run();
  if (!lastResult.error) return lastResult;

  for (let attempt = 1; attempt < RETRY_ATTEMPTS; attempt += 1) {
    const message = String(lastResult.error?.message ?? "");
    if (!isRetryableMessage(message)) break;
    await wait(RETRY_DELAY_MS * attempt);
    lastResult = await run();
    if (!lastResult.error) return lastResult;
  }

  return lastResult;
}

async function getLatestActiveStatusPeriod(params: {
  supabase: SupabaseClient;
  table: "sales_force_status" | "manager_status";
}): Promise<{ period: string | null; errorMessage: string | null }> {
  try {
    const result = await queryWithRetry(() =>
      params.supabase
        .from(params.table)
        .select("period_month")
        .eq("is_deleted", false)
        .eq("is_active", true)
        .order("period_month", { ascending: false })
        .limit(1)
        .maybeSingle<{ period_month: string | null }>(),
    );

    if (result.error) {
      return { period: null, errorMessage: formatRemoteErrorMessage(result.error) };
    }

    return { period: normalizeText(result.data?.period_month) || null, errorMessage: null };
  } catch (error) {
    return { period: null, errorMessage: formatRemoteErrorMessage(error) };
  }
}

export async function getContestParticipants(params: {
  supabase: SupabaseClient;
  maxCoveragePeriodMonth: string;
}): Promise<{ participants: ContestParticipant[]; message: string | null }> {
  const [salesStatusPeriodResult, managerStatusPeriodResult] = await Promise.all([
    getLatestActiveStatusPeriod({ supabase: params.supabase, table: "sales_force_status" }),
    getLatestActiveStatusPeriod({ supabase: params.supabase, table: "manager_status" }),
  ]);
  const salesStatusPeriod = salesStatusPeriodResult.period;
  const managerStatusPeriod = managerStatusPeriodResult.period;

  const [salesResult, managersResult] = await Promise.all([
    salesStatusPeriod
      ? queryWithRetry(() =>
        params.supabase
          .from("sales_force_status")
          .select("*")
          .eq("period_month", salesStatusPeriod)
          .eq("is_deleted", false)
          .eq("is_active", true)
          .eq("is_vacant", false),
      )
      : Promise.resolve({ data: [], error: null }),
    managerStatusPeriod
      ? queryWithRetry(() =>
        params.supabase
          .from("manager_status")
          .select("*")
          .eq("period_month", managerStatusPeriod)
          .eq("is_deleted", false)
          .eq("is_active", true),
      )
      : Promise.resolve({ data: [], error: null }),
  ]);

  const messages: string[] = [];
  if (!salesStatusPeriod) {
    messages.push(
      salesStatusPeriodResult.errorMessage
        ? `No se pudo resolver el ultimo periodo activo en sales_force_status: ${salesStatusPeriodResult.errorMessage}.`
        : "No hay periodo activo en sales_force_status para participantes ranking.",
    );
  }
  if (!managerStatusPeriod) {
    messages.push(
      managerStatusPeriodResult.errorMessage
        ? `No se pudo resolver el ultimo periodo activo en manager_status: ${managerStatusPeriodResult.errorMessage}.`
        : "No hay periodo activo en manager_status para participantes ranking.",
    );
  }
  if (salesStatusPeriod && salesStatusPeriod !== params.maxCoveragePeriodMonth) {
    messages.push(`Representantes tomados de sales_force_status ${salesStatusPeriod}; criterios evaluados hasta ${params.maxCoveragePeriodMonth}.`);
  }
  if (managerStatusPeriod && managerStatusPeriod !== params.maxCoveragePeriodMonth) {
    messages.push(`Managers tomados de manager_status ${managerStatusPeriod}; criterios evaluados hasta ${params.maxCoveragePeriodMonth}.`);
  }
  if (salesResult.error) messages.push(`No se pudieron cargar representantes: ${formatRemoteErrorMessage(salesResult.error)}.`);
  if (managersResult.error) messages.push(`No se pudieron cargar managers: ${formatRemoteErrorMessage(managersResult.error)}.`);

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
