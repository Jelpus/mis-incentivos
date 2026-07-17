"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { isAdminRole } from "@/lib/auth/impersonation";
import { getMissingRelationName, isMissingRelationError } from "@/lib/admin/incentive-rules/shared";
import { createAdminClient } from "@/lib/supabase/admin";

export type PlatformChangeLogActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

type BackfillChangeLogRow = {
  source_key: string;
  change_date: string;
  route: string;
  current_state: string;
  modified_state: string;
};

const CHANGE_LOG_TABLE = "platform_change_log";
const BACKFILL_CHANGE_DATE = "2026-07-17";

const BACKFILL_CHANGE_LOG_ROWS: BackfillChangeLogRow[] = [
  {
    source_key: "2026-07-17-source-ranking-period-coverage",
    change_date: BACKFILL_CHANGE_DATE,
    route: "/admin/source-ranking",
    current_state: "La cobertura de periodos se inferia desde una muestra limitada y podia quedar en marzo aunque existiera informacion YTD mayo.",
    modified_state: "La cobertura se valida con conteo exacto por periodo y tablas raw/agg para evitar el limite de 1000 rows.",
  },
  {
    source_key: "2026-07-17-profile-ranking-pagination",
    change_date: BACKFILL_CHANGE_DATE,
    route: "/perfil/ranking",
    current_state: "Las consultas de performance global usaban limites fijos al leer datos de Supabase.",
    modified_state: "Las lecturas se paginan hasta completar resultados antes de calcular ranking y performance.",
  },
  {
    source_key: "2026-07-17-mi-cuenta-ranking-period",
    change_date: BACKFILL_CHANGE_DATE,
    route: "/mi-cuenta",
    current_state: "El periodo disponible de ranking dependia de una lectura limitada de filas.",
    modified_state: "El periodo se resuelve con conteo exacto por periodo para no depender de la muestra retornada.",
  },
  {
    source_key: "2026-07-17-performance-report-scatter",
    change_date: BACKFILL_CHANGE_DATE,
    route: "/perfil/performance-report",
    current_state: "Attainment vs CPD/CPA mostraba CPD crudo y todos los bloques permanecian visibles en una sola pagina.",
    modified_state: "CPD se muestra como porcentaje vs objetivo, los cuadrantes permiten Promedio/100%/Ambos y los bloques se organizan en tabs.",
  },
  {
    source_key: "2026-07-17-ranking-detail-cpd-display",
    change_date: BACKFILL_CHANGE_DATE,
    route: "/perfil/ranking/detalle",
    current_state: "El detalle de CPD tomaba el valor porcentual usado para calificar el componente.",
    modified_state: "El detalle muestra Meta con objetivo CPD y Valor con CPD real, manteniendo cobertura interna para aprobacion.",
  },
  {
    source_key: "2026-07-17-admin-platform-change-log",
    change_date: BACKFILL_CHANGE_DATE,
    route: "/admin/platform",
    current_state: "No existia un registro central de cambios funcionales dentro de plataforma.",
    modified_state: "Se agrega bitacora con fecha, ruta, estados y commit, mas backfill inicial idempotente.",
  },
];

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeDateInput(value: unknown): string | null {
  const raw = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function resolveCommitRef(value: unknown): string | null {
  const raw = normalizeText(value);
  if (raw) return raw;
  const vercelCommit = normalizeText(process.env.VERCEL_GIT_COMMIT_SHA);
  return vercelCommit ? vercelCommit.slice(0, 12) : null;
}

function tableMissingMessage(error: { message?: string } | null): string {
  const tableName = getMissingRelationName(error) ?? CHANGE_LOG_TABLE;
  return `No existe la tabla ${tableName}. Ejecuta docs/platform-change-log-schema.sql.`;
}

function revalidatePlatformPage() {
  revalidatePath("/admin/platform");
  revalidatePath("/admin/platform/changes-control");
}

export async function createPlatformChangeLogAction(
  _prevState: PlatformChangeLogActionResult | null,
  formData: FormData,
): Promise<PlatformChangeLogActionResult> {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const changeDate = normalizeDateInput(formData.get("change_date"));
  const route = normalizeText(formData.get("route"));
  const currentState = normalizeText(formData.get("current_state"));
  const modifiedState = normalizeText(formData.get("modified_state"));
  const commitRef = resolveCommitRef(formData.get("commit_ref"));

  if (!changeDate) return { ok: false, message: "Fecha invalida." };
  if (!route) return { ok: false, message: "Ruta requerida." };
  if (!currentState) return { ok: false, message: "Estado actual requerido." };
  if (!modifiedState) return { ok: false, message: "Estado modificado requerido." };

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Admin client no disponible." };

  const result = await supabase
    .from(CHANGE_LOG_TABLE)
    .insert({
      change_date: changeDate,
      route,
      current_state: currentState,
      modified_state: modifiedState,
      commit_ref: commitRef,
      created_by: user.id,
    });

  if (result.error) {
    if (isMissingRelationError(result.error)) return { ok: false, message: tableMissingMessage(result.error) };
    return { ok: false, message: `No se pudo registrar el cambio: ${result.error.message}` };
  }

  revalidatePlatformPage();
  return { ok: true, message: "Cambio registrado." };
}

export async function backfillPlatformChangeLogAction(
  _prevState: PlatformChangeLogActionResult | null,
  _formData: FormData,
): Promise<PlatformChangeLogActionResult> {
  void _prevState;
  void _formData;

  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || !isAdminRole(role, isActive)) {
    return { ok: false, message: "No autorizado." };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Admin client no disponible." };

  const commitRef = resolveCommitRef(null) ?? "backfill-2026-07-17";
  const result = await supabase
    .from(CHANGE_LOG_TABLE)
    .upsert(
      BACKFILL_CHANGE_LOG_ROWS.map((row) => ({
        ...row,
        commit_ref: commitRef,
        created_by: user.id,
      })),
      { onConflict: "source_key" },
    );

  if (result.error) {
    if (isMissingRelationError(result.error)) return { ok: false, message: tableMissingMessage(result.error) };
    return { ok: false, message: `No se pudo ejecutar backfill: ${result.error.message}` };
  }

  revalidatePlatformPage();
  return { ok: true, message: `Backfill aplicado: ${BACKFILL_CHANGE_LOG_ROWS.length} cambios.` };
}
