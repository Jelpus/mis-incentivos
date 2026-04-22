import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/auth/email-domain";

type SalesForceStatusUserRow = {
  correo_electronico: string | null;
  nombre_completo: string | null;
  territorio_individual: string | null;
  no_empleado: number | null;
  is_active: boolean | null;
};

type ManagerStatusUserRow = {
  correo_manager: string | null;
  nombre_manager: string | null;
  territorio_manager: string | null;
  no_empleado_manager: number | null;
  is_active: boolean | null;
};

type ProfileRelationRow = {
  profile_email: string | null;
  user_id: string | null;
};

type ProfileLastLoginRow = {
  user_id: string;
  last_login: string | null;
};

type NormalizedUserAccumulator = {
  email: string;
  nombre: string | null;
  territorio: string | null;
  numeroEmpleado: number | null;
  isActive: boolean;
  sourceTypes: Set<"sales_force" | "manager">;
};

export type PlatformUserRow = {
  email: string;
  nombre: string | null;
  territorio: string | null;
  numeroEmpleado: number | null;
  isActive: boolean;
  isRegistered: boolean;
  relationUserId: string | null;
  lastLogin: string | null;
  sourceTypes: Array<"sales_force" | "manager">;
};

export type PlatformKpi = {
  total: number;
  registered: number;
  notRegistered: number;
  registeredRatio: number;
  activeInLast30Days: number;
};

export type PlatformPageData = {
  salesForcePeriod: string | null;
  managerPeriod: string | null;
  users: PlatformUserRow[];
  kpi: PlatformKpi;
};

function appendDistinctText(current: string | null, incoming: string | null): string | null {
  const base = String(current ?? "").trim();
  const next = String(incoming ?? "").trim();
  if (!base) return next || null;
  if (!next) return base;
  const baseLower = base.toLowerCase();
  const nextLower = next.toLowerCase();
  if (baseLower === nextLower) return base;
  return `${base} / ${next}`;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function isWithinLast30Days(isoDate: string | null): boolean {
  if (!isoDate) return false;
  const timestamp = new Date(isoDate).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const now = Date.now();
  const msIn30Days = 30 * 24 * 60 * 60 * 1000;
  return timestamp >= now - msIn30Days;
}

export async function getPlatformPageData(): Promise<PlatformPageData> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const [salesPeriodResult, managerPeriodResult] = await Promise.all([
    supabase
      .from("sales_force_status")
      .select("period_month")
      .eq("is_deleted", false)
      .order("period_month", { ascending: false })
      .limit(1),
    supabase
      .from("manager_status")
      .select("period_month")
      .eq("is_deleted", false)
      .order("period_month", { ascending: false })
      .limit(1),
  ]);

  if (salesPeriodResult.error) {
    throw new Error(`Failed to load sales_force_status period: ${salesPeriodResult.error.message}`);
  }

  if (managerPeriodResult.error) {
    throw new Error(`Failed to load manager_status period: ${managerPeriodResult.error.message}`);
  }

  const salesForcePeriod = salesPeriodResult.data?.[0]?.period_month ?? null;
  const managerPeriod = managerPeriodResult.data?.[0]?.period_month ?? null;

  const [salesRowsResult, managerRowsResult, relationsResult] = await Promise.all([
    salesForcePeriod
      ? supabase
          .from("sales_force_status")
          .select("correo_electronico, nombre_completo, territorio_individual, no_empleado, is_active")
          .eq("period_month", salesForcePeriod)
          .eq("is_deleted", false)
      : Promise.resolve({ data: [], error: null }),
    managerPeriod
      ? supabase
          .from("manager_status")
          .select("correo_manager, nombre_manager, territorio_manager, no_empleado_manager, is_active")
          .eq("period_month", managerPeriod)
          .eq("is_deleted", false)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("profile_relations")
      .select("profile_email, user_id")
      .eq("is_current", true),
  ]);

  if (salesRowsResult.error) {
    throw new Error(`Failed to load sales_force_status users: ${salesRowsResult.error.message}`);
  }

  if (managerRowsResult.error) {
    throw new Error(`Failed to load manager_status users: ${managerRowsResult.error.message}`);
  }

  if (relationsResult.error) {
    throw new Error(`Failed to load profile_relations users: ${relationsResult.error.message}`);
  }

  const accByEmail = new Map<string, NormalizedUserAccumulator>();

  for (const row of (salesRowsResult.data ?? []) as SalesForceStatusUserRow[]) {
    const email = normalizeEmail(String(row.correo_electronico ?? ""));
    if (!email || !email.includes("@")) continue;
    const current = accByEmail.get(email) ?? {
      email,
      nombre: null,
      territorio: null,
      numeroEmpleado: null,
      isActive: false,
      sourceTypes: new Set<"sales_force" | "manager">(),
    };
    current.nombre = appendDistinctText(current.nombre, row.nombre_completo);
    current.territorio = appendDistinctText(current.territorio, row.territorio_individual);
    if (current.numeroEmpleado === null && row.no_empleado !== null) {
      current.numeroEmpleado = row.no_empleado;
    }
    current.isActive = current.isActive || Boolean(row.is_active);
    current.sourceTypes.add("sales_force");
    accByEmail.set(email, current);
  }

  for (const row of (managerRowsResult.data ?? []) as ManagerStatusUserRow[]) {
    const email = normalizeEmail(String(row.correo_manager ?? ""));
    if (!email || !email.includes("@")) continue;
    const current = accByEmail.get(email) ?? {
      email,
      nombre: null,
      territorio: null,
      numeroEmpleado: null,
      isActive: false,
      sourceTypes: new Set<"sales_force" | "manager">(),
    };
    current.nombre = appendDistinctText(current.nombre, row.nombre_manager);
    current.territorio = appendDistinctText(current.territorio, row.territorio_manager);
    if (current.numeroEmpleado === null && row.no_empleado_manager !== null) {
      current.numeroEmpleado = row.no_empleado_manager;
    }
    current.isActive = current.isActive || Boolean(row.is_active);
    current.sourceTypes.add("manager");
    accByEmail.set(email, current);
  }

  const relationUserIdByEmail = new Map<string, string>();
  for (const relation of (relationsResult.data ?? []) as ProfileRelationRow[]) {
    const email = normalizeEmail(String(relation.profile_email ?? ""));
    const userId = String(relation.user_id ?? "").trim();
    if (!email || !userId || !accByEmail.has(email) || relationUserIdByEmail.has(email)) continue;
    relationUserIdByEmail.set(email, userId);
  }

  const relationUserIds = Array.from(new Set(Array.from(relationUserIdByEmail.values())));
  const profileLastLoginByUserId = new Map<string, string | null>();

  for (const chunk of chunkArray(relationUserIds, 300)) {
    const profilesResult = await supabase
      .from("profiles")
      .select("user_id, last_login")
      .in("user_id", chunk);

    if (profilesResult.error) {
      throw new Error(`Failed to load profiles last_login: ${profilesResult.error.message}`);
    }

    for (const profile of (profilesResult.data ?? []) as ProfileLastLoginRow[]) {
      profileLastLoginByUserId.set(profile.user_id, profile.last_login ?? null);
    }
  }

  const users = Array.from(accByEmail.values())
    .map<PlatformUserRow>((user) => {
      const relationUserId = relationUserIdByEmail.get(user.email) ?? null;
      const lastLogin = relationUserId
        ? (profileLastLoginByUserId.get(relationUserId) ?? null)
        : null;
      return {
        email: user.email,
        nombre: user.nombre,
        territorio: user.territorio,
        numeroEmpleado: user.numeroEmpleado,
        isActive: user.isActive,
        isRegistered: Boolean(relationUserId),
        relationUserId,
        lastLogin,
        sourceTypes: Array.from(user.sourceTypes.values()),
      };
    })
    .sort((a, b) => {
      if (a.isRegistered !== b.isRegistered) {
        return a.isRegistered ? 1 : -1;
      }
      return a.email.localeCompare(b.email);
    });

  const total = users.length;
  const registered = users.filter((user) => user.isRegistered).length;
  const notRegistered = Math.max(total - registered, 0);
  const activeInLast30Days = users.filter(
    (user) => user.isRegistered && isWithinLast30Days(user.lastLogin),
  ).length;
  const registeredRatio = total > 0 ? registered / total : 0;

  return {
    salesForcePeriod,
    managerPeriod,
    users,
    kpi: {
      total,
      registered,
      notRegistered,
      registeredRatio,
      activeInLast30Days,
    },
  };
}
