// lib/admin/status/get-status-page-data.ts
import { createAdminClient } from "@/lib/supabase/admin";

export type StatusPageRow = {
  id: string;
  period_month: string;
  linea_principal: string;
  parrilla: string;
  nombre_completo: string;
  no_empleado: number | null;
  territorio_padre: string;
  correo_electronico: string | null;
  puesto: string;
  ciudad: string | null;
  fecha_ingreso: string | null;
  team_id: string;
  territorio_individual: string;
  base_incentivos: number;
  is_active: boolean;
  is_vacant: boolean;
  manager_status_id: string | null;
  nombre_manager: string | null;
  correo_manager: string | null;
  no_empleado_manager: number | null;
};

type ManagerRecord = {
  id: string;
  territorio_manager: string;
  nombre_manager: string | null;
  correo_manager: string | null;
  no_empleado_manager: number | null;
  team_id: string | null;
  is_active: boolean;
  is_vacant: boolean;
};

export type ManagerStatusRow = ManagerRecord & {
  period_month: string;
};

export type StatusCloneContext = {
  latest_period: string | null;
  suggested_next_period: string | null;
  latest_count: number;
  target_count: number;
  can_clone: boolean;
  message: string;
};

export type StatusPageData = {
  periodMonth: string;
  latestAvailablePeriodMonth: string | null;
  rows: StatusPageRow[];
  managers: ManagerStatusRow[];
  totalRows: number;
  activeRows: number;
  inactiveRows: number;
  vacantRows: number;
  latestBatch: {
    id: string;
    status: string;
    period_month: string | null;
    file_name: string | null;
    created_at: string;
    total_rows: number | null;
    valid_rows: number | null;
    invalid_rows: number | null;
    insert_rows: number | null;
    update_rows: number | null;
    noop_rows: number | null;
  } | null;
  cloneContext: StatusCloneContext | null;
};

function getCurrentPeriodMonth(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function normalizePeriodMonthInput(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  if (/^\d{4}-\d{2}$/.test(raw)) {
    return `${raw}-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  return null;
}

export async function getStatusPageData(
  periodMonthInput?: string | null,
): Promise<StatusPageData> {
  const supabase = createAdminClient();

  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const [
    latestPeriodResult,
    cloneContextResult,
    latestBatchResult,
  ] = await Promise.all([
    supabase
      .from("sales_force_status")
      .select("period_month")
      .eq("is_deleted", false)
      .order("period_month", { ascending: false })
      .limit(1),
    supabase.rpc("get_sales_force_period_clone_context"),
    supabase
      .from("import_batches")
      .select(`
        id,
        status,
        period_month,
        file_name,
        created_at,
        total_rows,
        valid_rows,
        invalid_rows,
        insert_rows,
        update_rows,
        noop_rows,
        import_type:import_types!inner(code)
      `)
      .eq("import_type.code", "sales_force_status")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (latestPeriodResult.error) {
    throw new Error(
      `Failed to load latest period: ${latestPeriodResult.error.message}`,
    );
  }

  if (cloneContextResult.error) {
    throw new Error(
      `Failed to load clone context: ${cloneContextResult.error.message}`,
    );
  }

  if (latestBatchResult.error) {
    throw new Error(
      `Failed to load latest batch: ${latestBatchResult.error.message}`,
    );
  }

  const latestAvailablePeriodMonth =
    latestPeriodResult.data?.[0]?.period_month ?? null;

  const requestedPeriodMonth = normalizePeriodMonthInput(periodMonthInput);
  const periodMonth =
    requestedPeriodMonth ?? latestAvailablePeriodMonth ?? getCurrentPeriodMonth();

  const [rowsResult, activeCountResult, vacantCountResult, managersResult] = await Promise.all([
    supabase
      .from("sales_force_status")
      .select(
        `
          id,
          period_month,
          linea_principal,
          parrilla,
          nombre_completo,
          no_empleado,
          territorio_padre,
          correo_electronico,
          puesto,
          ciudad,
          fecha_ingreso,
          team_id,
          territorio_individual,
          base_incentivos,
          is_active,
          is_vacant
        `,
        { count: "exact" },
      )
      .eq("period_month", periodMonth)
      .eq("is_deleted", false)
      .order("nombre_completo", { ascending: true })
      .limit(100),
    supabase
      .from("sales_force_status")
      .select("id", { count: "exact", head: true })
      .eq("period_month", periodMonth)
      .eq("is_deleted", false)
      .eq("is_active", true),
    supabase
      .from("sales_force_status")
      .select("id", { count: "exact", head: true })
      .eq("period_month", periodMonth)
      .eq("is_deleted", false)
      .eq("is_vacant", true),
    supabase
      .from("manager_status")
      .select(`
        id,
        period_month,
        territorio_manager,
        nombre_manager,
        correo_manager,
        no_empleado_manager,
        team_id,
        is_active,
        is_vacant
      `)
      .eq("period_month", periodMonth)
      .eq("is_deleted", false),
  ]);

  if (rowsResult.error) {
    throw new Error(`Failed to load sales_force_status: ${rowsResult.error.message}`);
  }

  if (activeCountResult.error) {
    throw new Error(
      `Failed to load active status count: ${activeCountResult.error.message}`,
    );
  }

  if (vacantCountResult.error) {
    throw new Error(
      `Failed to load vacant status count: ${vacantCountResult.error.message}`,
    );
  }

  if (managersResult.error) {
    throw new Error(
      `Failed to load manager_status: ${managersResult.error.message}`,
    );
  }

  const totalRows = rowsResult.count ?? rowsResult.data?.length ?? 0;
  const activeRows = activeCountResult.count ?? 0;
  const vacantRows = vacantCountResult.count ?? 0;
  const inactiveRows = Math.max(totalRows - activeRows, 0);

  const managerByTerritorio = new Map<string, ManagerRecord>(
    ((managersResult.data ?? []) as ManagerRecord[]).map((manager) => [
      manager.territorio_manager,
      manager,
    ]),
  );

  const enrichedRows = ((rowsResult.data ?? []) as StatusPageRow[]).map((row) => {
    const manager = managerByTerritorio.get(row.territorio_padre);
    return {
      ...row,
      manager_status_id: manager?.id ?? null,
      nombre_manager: manager?.nombre_manager ?? null,
      correo_manager: manager?.correo_manager ?? null,
      no_empleado_manager: manager?.no_empleado_manager ?? null,
    };
  });

  return {
    periodMonth,
    latestAvailablePeriodMonth,
    rows: enrichedRows,
    managers: (managersResult.data ?? []) as ManagerStatusRow[],
    totalRows,
    activeRows,
    inactiveRows,
    vacantRows,
    latestBatch: (latestBatchResult.data as StatusPageData["latestBatch"]) ?? null,
    cloneContext: (cloneContextResult.data ?? null) as StatusCloneContext | null,
  };
}
