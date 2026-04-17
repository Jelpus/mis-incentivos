import { createAdminClient } from "@/lib/supabase/admin";
import { getMissingRelationName, isMissingRelationError } from "@/lib/admin/incentive-rules/shared";

export type TeamAdminOption = {
  userId: string;
  email: string | null;
  displayName: string;
  pictureUrl: string | null;
};

export type TeamAdminRow = {
  teamId: string;
  adminUserId: string | null;
};

export type TeamsAdminPageData = {
  storageReady: boolean;
  storageMessage: string | null;
  admins: TeamAdminOption[];
  rows: TeamAdminRow[];
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function getTeamsAdminPageData(): Promise<TeamsAdminPageData> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const teamsResult = await supabase
    .from("sales_force_status")
    .select("team_id")
    .eq("is_deleted", false)
    .not("team_id", "is", null)
    .neq("team_id", "");

  if (teamsResult.error) {
    if (isMissingRelationError(teamsResult.error)) {
      const tableName = getMissingRelationName(teamsResult.error) ?? "sales_force_status";
      return {
        storageReady: false,
        storageMessage: `Tabla ${tableName} no creada.`,
        admins: [],
        rows: [],
      };
    }
    throw new Error(`Failed to load teams from sales_force_status: ${teamsResult.error.message}`);
  }

  const adminsResult = await supabase
    .from("profiles")
    .select("user_id, email, first_name, last_name, picture_url")
    .eq("global_role", "admin")
    .eq("is_active", true)
    .order("email", { ascending: true });

  if (adminsResult.error) {
    if (isMissingRelationError(adminsResult.error)) {
      const tableName = getMissingRelationName(adminsResult.error) ?? "profiles";
      return {
        storageReady: false,
        storageMessage: `Tabla ${tableName} no creada.`,
        admins: [],
        rows: [],
      };
    }
    throw new Error(`Failed to load admin profiles: ${adminsResult.error.message}`);
  }

  const assignmentsResult = await supabase
    .from("team_admin_assignments")
    .select("team_id, admin_user_id");

  if (assignmentsResult.error) {
    if (isMissingRelationError(assignmentsResult.error)) {
      const tableName = getMissingRelationName(assignmentsResult.error) ?? "team_admin_assignments";
      return {
        storageReady: false,
        storageMessage: `Tabla ${tableName} no creada. Ejecuta docs/teams-admin-schema.sql.`,
        admins: [],
        rows: [],
      };
    }
    throw new Error(`Failed to load team admin assignments: ${assignmentsResult.error.message}`);
  }

  const teamIds = Array.from(
    new Set(
      (teamsResult.data ?? [])
        .map((row) => normalizeText((row as { team_id?: unknown }).team_id))
        .filter((value) => value.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, "es"));

  const admins: TeamAdminOption[] = ((adminsResult.data ?? []) as Array<{
    user_id?: unknown;
    email?: unknown;
    first_name?: unknown;
    last_name?: unknown;
    picture_url?: unknown;
  }>)
    .map((row) => {
      const userId = normalizeText(row.user_id);
      if (!userId) return null;

      const email = normalizeText(row.email) || null;
      const firstName = normalizeText(row.first_name);
      const lastName = normalizeText(row.last_name);
      const fullName = `${firstName} ${lastName}`.trim();
      const pictureUrl = normalizeText(row.picture_url) || null;

      return {
        userId,
        email,
        displayName: fullName || email || userId,
        pictureUrl,
      };
    })
    .filter((row): row is TeamAdminOption => Boolean(row));

  const assignmentMap = new Map<string, string>();
  for (const row of (assignmentsResult.data ?? []) as Array<{ team_id?: unknown; admin_user_id?: unknown }>) {
    const teamId = normalizeText(row.team_id);
    const adminUserId = normalizeText(row.admin_user_id);
    if (!teamId || !adminUserId) continue;
    assignmentMap.set(teamId, adminUserId);
  }

  const rows: TeamAdminRow[] = teamIds.map((teamId) => ({
    teamId,
    adminUserId: assignmentMap.get(teamId) ?? null,
  }));

  return {
    storageReady: true,
    storageMessage: null,
    admins,
    rows,
  };
}
