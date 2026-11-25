import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllSupabaseRows } from "@/lib/supabase/paginated-query";
import type { CertificationRow, CertificationStatusRow, CertificationSummary } from "@/lib/admin/source-ranking/normalize-certifications";

export type CertificationVersion = {
  id: string;
  certification_year: number;
  version_no: number;
  original_file_name: string;
  status_period_month: string;
  summary: CertificationSummary;
  created_at: string;
};

export type AnnualCertificationsData = {
  year: number;
  years: number[];
  versions: CertificationVersion[];
  rows: CertificationRow[];
  error: string | null;
};

export function getCertificationYears(): number[] {
  const currentYear = Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Madrid", year: "numeric" }).format(new Date()));
  return Array.from({ length: Math.max(1, currentYear - 2026 + 1) }, (_, index) => currentYear - index);
}

export function validCertificationYear(year: number): boolean {
  return Number.isInteger(year) && getCertificationYears().includes(year);
}

export async function loadCertificationStatus(supabase: SupabaseClient, year: number): Promise<{ period: string; rows: CertificationStatusRow[] }> {
  const latest = await supabase.from("sales_force_status").select("period_month")
    .gte("period_month", `${year}-01-01`).lt("period_month", `${year + 1}-01-01`)
    .eq("is_deleted", false).eq("is_active", true)
    .order("period_month", { ascending: false }).order("id").limit(1).maybeSingle<{ period_month: string }>();
  if (latest.error) throw new Error(latest.error.message);
  if (!latest.data) throw new Error(`No hay Status activo para ${year}. Carga el Status del año antes de las certificaciones.`);
  const period = latest.data.period_month;
  const rows = await fetchAllSupabaseRows<CertificationStatusRow>({
    context: `No se pudo leer Status de ${period}`,
    pageQuery: (from, to) => supabase.from("sales_force_status")
      .select("no_empleado, territorio_individual, nombre_completo, is_vacant")
      .eq("period_month", period).eq("is_deleted", false).eq("is_active", true)
      .order("id").range(from, to),
  });
  return { period, rows };
}

export async function loadAnnualCertificationsData(supabase: SupabaseClient, year: number): Promise<AnnualCertificationsData> {
  const data: AnnualCertificationsData = { year, years: getCertificationYears(), versions: [], rows: [], error: null };
  try {
    data.versions = await fetchAllSupabaseRows<CertificationVersion>({
      context: "No se pudieron cargar las versiones de Oficial Certificaciones",
      pageQuery: (from, to) => supabase.from("ranking_certification_versions")
        .select("id, certification_year, version_no, original_file_name, status_period_month, summary, created_at")
        .eq("certification_year", year).order("version_no", { ascending: false }).order("id").range(from, to),
    });
    if (data.versions[0]) {
      data.rows = await fetchAllSupabaseRows<CertificationRow>({
        context: "No se pudieron cargar las calificaciones oficiales",
        pageQuery: (from, to) => supabase.from("ranking_certification_rows").select("*")
          .eq("version_id", data.versions[0].id).order("source_row").order("id").range(from, to),
      });
    }
  } catch (error) {
    data.error = error instanceof Error ? error.message : "No se pudieron consultar las certificaciones.";
  }
  return data;
}
