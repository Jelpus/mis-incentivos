import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllSupabaseRows } from "@/lib/supabase/paginated-query";
import type { CertificationRow } from "@/lib/admin/source-ranking/normalize-certifications";
import type { ContestComponentEvaluation, ContestParticipant, RankingContest, RankingContestComponent } from "@/lib/ranking-contests/types";

export type AnnualCertificationMetric = "annual_certification_pct" | "scientific_knowledge_pct";
export type AnnualCertificationSnapshot = { version: { id: string; version_no: number } | null; rows: CertificationRow[] };
export type AnnualCertificationLoader = (year: number) => Promise<AnnualCertificationSnapshot>;

// One loader per ranking request: both criteria and every participant share the
// same complete version, without persisting scores across users or uploads.
export function createAnnualCertificationLoader(supabase: SupabaseClient): AnnualCertificationLoader {
  const snapshots = new Map<number, Promise<AnnualCertificationSnapshot>>();
  return (year) => {
    let snapshot = snapshots.get(year);
    if (!snapshot) {
      snapshot = (async () => {
        const version = await supabase.from("ranking_certification_versions").select("id, version_no")
          .eq("certification_year", year).order("version_no", { ascending: false }).order("id").limit(1)
          .maybeSingle<{ id: string; version_no: number }>();
        if (version.error) throw new Error(version.error.message);
        if (!version.data) return { version: null, rows: [] };
        const versionInfo = version.data;
        const rows = await fetchAllSupabaseRows<CertificationRow>({
          context: "No se pudieron leer las calificaciones anuales",
          pageQuery: (from, to) => supabase.from("ranking_certification_rows")
            .select("source_row, source_employee, source_territory, source_name, matched_employee, matched_territory, matched_name, matched_by, match_issue, annual_certification_pct, scientific_knowledge_pct")
            .eq("version_id", versionInfo.id).order("id").range(from, to),
        });
        return { version: versionInfo, rows };
      })();
      snapshots.set(year, snapshot);
    }
    return snapshot;
  };
}

export function resolveAnnualCertificationMetric(name: string): AnnualCertificationMetric | null {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
  if (normalized.includes("certificacion anual")) return "annual_certification_pct";
  if (normalized.includes("conocimiento cientifico")) return "scientific_knowledge_pct";
  return null;
}

type Member = { no_empleado: number | null; territorio_individual: string | null };
const key = (value: unknown) => String(value ?? "").trim().toUpperCase();

async function getAnnualMembers(supabase: SupabaseClient, participant: ContestParticipant, year: number, cutoff: string): Promise<Member[]> {
  if (participant.scope === "rep") return [{ no_empleado: Number(participant.employeeNumber) || null, territorio_individual: participant.territory ?? null }];
  if (!participant.territory && !participant.teamId) throw new Error("El manager no tiene territorio ni equipo para evaluar.");
  const latest = await supabase.from("sales_force_status").select("period_month")
    .gte("period_month", `${year}-01-01`).lte("period_month", cutoff).eq("is_active", true).eq("is_deleted", false)
    .order("period_month", { ascending: false }).order("id").limit(1).maybeSingle<{ period_month: string }>();
  if (latest.error) throw new Error(latest.error.message);
  if (!latest.data) return [];
  return fetchAllSupabaseRows<Member>({
    context: "No se pudo leer el equipo para las certificaciones",
    pageQuery: (from, to) => {
      let query = supabase.from("sales_force_status").select("no_empleado, territorio_individual")
        .eq("period_month", latest.data!.period_month).eq("is_active", true).eq("is_deleted", false).eq("is_vacant", false);
      query = participant.territory ? query.ilike("territorio_padre", participant.territory) : query.eq("team_id", participant.teamId!);
      return query.order("id").range(from, to);
    },
  });
}

export async function evaluateAnnualCertification(params: {
  supabase: SupabaseClient;
  component: RankingContestComponent;
  participant: ContestParticipant;
  contest: RankingContest;
  maxCoveragePeriodMonth: string;
  metric: AnnualCertificationMetric;
  loadAnnualSnapshot?: AnnualCertificationLoader;
}): Promise<ContestComponentEvaluation> {
  const { component } = params;
  const thresholdRaw = component.thresholdValue;
  const threshold = thresholdRaw === null || String(thresholdRaw).trim() === "" ? null : Number(thresholdRaw);
  const base = {
    componentId: component.id, componentName: component.componentName, thresholdValue: threshold,
    periodStart: component.periodStart, periodEnd: component.periodEnd,
  };
  const pending = (reason: string): ContestComponentEvaluation => ({ ...base, value: null, passed: false, status: "pending", reason });
  const start = component.periodStart ?? params.contest.coveragePeriodStart ?? params.maxCoveragePeriodMonth;
  const end = component.periodEnd ?? start;
  const year = Number(start.slice(0, 4));
  if (!Number.isInteger(year) || year !== Number(end.slice(0, 4))) return pending("El criterio anual debe corresponder a un único año.");
  if (start > params.maxCoveragePeriodMonth) return { ...base, value: null, passed: true, status: "passed", reason: "El periodo de evaluación de este criterio aún no comienza." };
  if (threshold === null || !Number.isFinite(threshold) || threshold < 0 || threshold > 100) return pending("Configura un umbral válido para el criterio anual.");
  const thresholdPercent = threshold <= 1 ? threshold * 100 : threshold;
  try {
    const [snapshot, members] = await Promise.all([
      (params.loadAnnualSnapshot ?? createAnnualCertificationLoader(params.supabase))(year),
      getAnnualMembers(params.supabase, params.participant, year, params.maxCoveragePeriodMonth),
    ]);
    if (!snapshot.version) return pending(`Falta cargar Oficial Certificaciones del año ${year}.`);
    const { version: versionInfo, rows } = snapshot;
    if (members.length === 0) return pending(`No se encontraron miembros del equipo para evaluar ${year}.`);
    const uniqueMembers = [...new Map(members.map((m) => [m.no_empleado ? `emp:${m.no_empleado}` : `terr:${key(m.territorio_individual)}`, m])).values()];
    const scores: number[] = [];
    for (const member of uniqueMembers) {
      if (!member.no_empleado && !key(member.territorio_individual)) return pending(`Oficial ${year}: el participante no tiene empleado ni territorio para vincular su nota.`);
      const candidates = rows.filter((r) => member.no_empleado
        ? Number(r.matched_employee ?? r.source_employee) === member.no_empleado
        : key(r.matched_territory ?? r.source_territory) === key(member.territorio_individual));
      if (candidates.length !== 1 || !["employee", "territory"].includes(candidates[0].matched_by)) {
        return pending(`Oficial ${year} v${versionInfo.version_no}: falta una vinculación única para ${member.no_empleado ?? member.territorio_individual}. Revisa las incidencias de la carga.`);
      }
      const raw = candidates[0][params.metric];
      if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) return pending(`Oficial ${year} v${versionInfo.version_no}: calificación pendiente para ${member.no_empleado ?? member.territorio_individual}.`);
      scores.push(Number(raw));
    }
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const passed = average >= thresholdPercent;
    return {
      ...base, value: Math.round(average * 100) / 100, passed, status: passed ? "passed" : "failed",
      reason: `Oficial Certificaciones ${year}, versión ${versionInfo.version_no}. ${params.participant.scope === "manager" ? `Promedio del equipo (${scores.length} personas)` : "Calificación individual"}. Fuente: ${params.metric === "annual_certification_pct" ? "% Acreditación" : "Conocimiento científico"}. Umbral ${thresholdPercent}%. Se usa una vez en el año, sin acumulación mensual.`,
    };
  } catch (error) {
    return pending(`No se pudieron evaluar las certificaciones ${year}: ${error instanceof Error ? error.message : "error de lectura"}`);
  }
}
