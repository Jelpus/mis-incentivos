import { createAdminClient } from "@/lib/supabase/admin";
import { getMissingRelationName, isMissingRelationError } from "@/lib/admin/incentive-rules/shared";

function normalizeGroupKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export type RankingGroupRow = {
  id: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
};

export type ContestParticipationRow = {
  contestId: string;
  contestName: string;
  isActive: boolean;
  participantGroupIds: string[];
};

export type RankingParticipationData = {
  storageReady: boolean;
  storageMessage: string | null;
  groups: RankingGroupRow[];
  contests: ContestParticipationRow[];
};

export async function getRankingParticipationData(): Promise<RankingParticipationData> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const contestsResult = await supabase
    .from("ranking_contests")
    .select("id, contest_name, is_active")
    .order("contest_name", { ascending: true });

  if (contestsResult.error) {
    if (isMissingRelationError(contestsResult.error)) {
      const tableName = getMissingRelationName(contestsResult.error) ?? "ranking_contests";
      return {
        storageReady: false,
        storageMessage: `Tabla ${tableName} no creada. Ejecuta docs/ranking-contests-schema.sql.`,
        groups: [],
        contests: [],
      };
    }
    throw new Error(`Failed to load contests for participation: ${contestsResult.error.message}`);
  }

  const complementsResult = await supabase
    .from("ranking_rule_complements")
    .select("ranking")
    .not("ranking", "is", null)
    .neq("ranking", "");

  if (complementsResult.error) {
    if (isMissingRelationError(complementsResult.error)) {
      const tableName = getMissingRelationName(complementsResult.error) ?? "ranking_rule_complements";
      return {
        storageReady: false,
        storageMessage: `Tabla ${tableName} no creada. Ejecuta docs/ranking-rule-complements-schema.sql.`,
        groups: [],
        contests: [],
      };
    }
    throw new Error(`Failed to load ranking complements: ${complementsResult.error.message}`);
  }

  const distinctRankings = Array.from(
    new Set(
      (complementsResult.data ?? [])
        .map((row) => String((row as { ranking?: unknown }).ranking ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  );

  const groupsResult = await supabase
    .from("ranking_groups")
    .select("id, name, normalized_name, is_active")
    .order("name", { ascending: true });

  if (groupsResult.error) {
    if (isMissingRelationError(groupsResult.error)) {
      const tableName = getMissingRelationName(groupsResult.error) ?? "ranking_groups";
      return {
        storageReady: false,
        storageMessage: `Tabla ${tableName} no creada. Ejecuta docs/ranking-contests-schema.sql.`,
        groups: [],
        contests: [],
      };
    }
    throw new Error(`Failed to load ranking groups: ${groupsResult.error.message}`);
  }

  type GroupRaw = {
    id: string | null;
    name: string | null;
    normalized_name: string | null;
    is_active: boolean | null;
  };

  const existingGroups = ((groupsResult.data ?? []) as GroupRaw[])
    .map((row) => {
      const id = String(row.id ?? "").trim();
      const name = String(row.name ?? "").trim();
      const normalizedName = String(row.normalized_name ?? "").trim();
      if (!id || !name || !normalizedName) return null;
      return {
        id,
        name,
        normalizedName,
        isActive: row.is_active !== false,
      };
    })
    .filter((row): row is RankingGroupRow => Boolean(row));

  const byNormalized = new Map(existingGroups.map((item) => [item.normalizedName, item]));

  const missingGroups = distinctRankings
    .map((name) => {
      const normalizedName = normalizeGroupKey(name);
      if (!normalizedName || byNormalized.has(normalizedName)) return null;
      return {
        name,
        normalized_name: normalizedName,
        is_active: true,
      };
    })
    .filter((row): row is { name: string; normalized_name: string; is_active: boolean } => Boolean(row));

  if (missingGroups.length > 0) {
    const insertGroupsResult = await supabase
      .from("ranking_groups")
      .upsert(missingGroups, { onConflict: "normalized_name" });

    if (insertGroupsResult.error) {
      throw new Error(`Failed to sync ranking groups: ${insertGroupsResult.error.message}`);
    }
  }

  const refreshedGroupsResult = await supabase
    .from("ranking_groups")
    .select("id, name, normalized_name, is_active")
    .order("name", { ascending: true });

  if (refreshedGroupsResult.error) {
    throw new Error(`Failed to reload ranking groups: ${refreshedGroupsResult.error.message}`);
  }

  const groups: RankingGroupRow[] = ((refreshedGroupsResult.data ?? []) as GroupRaw[])
    .map((row) => {
      const id = String(row.id ?? "").trim();
      const name = String(row.name ?? "").trim();
      const normalizedName = String(row.normalized_name ?? "").trim();
      if (!id || !name || !normalizedName) return null;
      return {
        id,
        name,
        normalizedName,
        isActive: row.is_active !== false,
      };
    })
    .filter((row): row is RankingGroupRow => Boolean(row));

  const participantsResult = await supabase
    .from("ranking_contest_participants")
    .select("contest_id, ranking_group_id");

  if (participantsResult.error) {
    if (isMissingRelationError(participantsResult.error)) {
      const tableName = getMissingRelationName(participantsResult.error) ?? "ranking_contest_participants";
      return {
        storageReady: false,
        storageMessage: `Tabla ${tableName} no creada. Ejecuta docs/ranking-contests-schema.sql.`,
        groups: [],
        contests: [],
      };
    }
    throw new Error(`Failed to load contest participants: ${participantsResult.error.message}`);
  }

  const participantMap = new Map<string, string[]>();
  for (const row of (participantsResult.data ?? []) as Array<{ contest_id?: unknown; ranking_group_id?: unknown }>) {
    const contestId = String(row.contest_id ?? "").trim();
    const groupId = String(row.ranking_group_id ?? "").trim();
    if (!contestId || !groupId) continue;
    const arr = participantMap.get(contestId) ?? [];
    arr.push(groupId);
    participantMap.set(contestId, arr);
  }

  const contests: ContestParticipationRow[] = ((contestsResult.data ?? []) as Array<{ id?: unknown; contest_name?: unknown; is_active?: unknown }>)
    .map((row) => {
      const contestId = String(row.id ?? "").trim();
      const contestName = String(row.contest_name ?? "").trim();
      if (!contestId || !contestName) return null;
      return {
        contestId,
        contestName,
        isActive: row.is_active !== false,
        participantGroupIds: participantMap.get(contestId) ?? [],
      };
    })
    .filter((row): row is ContestParticipationRow => Boolean(row));

  return {
    storageReady: true,
    storageMessage: null,
    groups,
    contests,
  };
}
