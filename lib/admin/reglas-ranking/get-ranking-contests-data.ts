import { createAdminClient } from "@/lib/supabase/admin";
import { getMissingRelationName, isMissingRelationError } from "@/lib/admin/incentive-rules/shared";

function formatMaxTwoDecimals(value: number | string | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const parsed = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return raw;

  const rounded = Math.round(parsed * 100) / 100;
  if (Object.is(rounded, -0)) return "0";
  return rounded.toString();
}

function normalizeDateToMonth(value: string | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 7);
  return raw;
}

function normalizeScope(value: string | null): "rep" | "manager" {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "manager" || raw === "manger" ? "manager" : "rep";
}

export type RankingContestComponentRow = {
  id: string;
  name: string;
  threshold: string;
  periodStart: string;
  periodEnd: string;
  isActive: boolean;
  sortOrder: number;
};

export type RankingContestPrizeRow = {
  id: string;
  placeNo: number;
  title: string;
  amountMxn: string;
  description: string;
  sortOrder: number;
};

export type RankingContestRow = {
  id: string;
  contestName: string;
  scope: "rep" | "manager";
  participationScope: "all_fdv" | "ranking_groups";
  paymentDate: string;
  coveragePeriodStart: string;
  coveragePeriodEnd: string;
  orderValue: string;
  isActive: boolean;
  updatedAt: string;
  components: RankingContestComponentRow[];
  prizes: RankingContestPrizeRow[];
};

export type RankingContestsData = {
  contestsStorageReady: boolean;
  contestsStorageMessage: string | null;
  contests: RankingContestRow[];
};

export async function getRankingContestsData(): Promise<RankingContestsData> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const contestsResult = await supabase
    .from("ranking_contests")
    .select("id, contest_name, scope, participation_scope, payment_date, coverage_period_start, coverage_period_end, order_value, is_active, updated_at")
    .order("order_value", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (contestsResult.error) {
    if (isMissingRelationError(contestsResult.error)) {
      const tableName = getMissingRelationName(contestsResult.error) ?? "ranking_contests";
      return {
        contestsStorageReady: false,
        contestsStorageMessage: `Tabla ${tableName} no creada. Ejecuta docs/ranking-contests-schema.sql.`,
        contests: [],
      };
    }
    throw new Error(`Failed to load ranking contests: ${contestsResult.error.message}`);
  }

  type ContestRowRaw = {
    id: string | null;
    contest_name: string | null;
    scope: string | null;
    participation_scope: string | null;
    payment_date: string | null;
    coverage_period_start: string | null;
    coverage_period_end: string | null;
    order_value: number | string | null;
    is_active: boolean | null;
    updated_at: string | null;
  };

  const contestsBase = ((contestsResult.data ?? []) as ContestRowRaw[])
    .map((row) => {
      const id = String(row.id ?? "").trim();
      if (!id) return null;

      return {
        id,
        contestName: String(row.contest_name ?? "").trim(),
        scope: normalizeScope(row.scope),
        participationScope:
          String(row.participation_scope ?? "").trim().toLowerCase() === "all_fdv"
            ? ("all_fdv" as const)
            : ("ranking_groups" as const),
        paymentDate: normalizeDateToMonth(row.payment_date),
        coveragePeriodStart: normalizeDateToMonth(row.coverage_period_start),
        coveragePeriodEnd: normalizeDateToMonth(row.coverage_period_end),
        orderValue: formatMaxTwoDecimals(row.order_value),
        isActive: row.is_active !== false,
        updatedAt: String(row.updated_at ?? "").trim(),
      };
    })
    .filter((row): row is Omit<RankingContestRow, "components" | "prizes"> => Boolean(row));

  const contestIds = contestsBase.map((row) => row.id);
  const componentsByContestId = new Map<string, RankingContestComponentRow[]>();
  const prizesByContestId = new Map<string, RankingContestPrizeRow[]>();

  if (contestIds.length > 0) {
    const componentsResult = await supabase
      .from("ranking_contest_components")
      .select("id, contest_id, component_name, threshold_value, period_start, period_end, is_active, sort_order")
      .in("contest_id", contestIds)
      .order("sort_order", { ascending: true });

    if (componentsResult.error) {
      if (isMissingRelationError(componentsResult.error)) {
        const tableName = getMissingRelationName(componentsResult.error) ?? "ranking_contest_components";
        return {
          contestsStorageReady: false,
          contestsStorageMessage: `Tabla ${tableName} no creada. Ejecuta docs/ranking-contests-schema.sql.`,
          contests: [],
        };
      }
      throw new Error(`Failed to load ranking contest components: ${componentsResult.error.message}`);
    }

    type ComponentRowRaw = {
      id: string | null;
      contest_id: string | null;
      component_name: string | null;
      threshold_value: number | string | null;
      period_start: string | null;
      period_end: string | null;
      is_active: boolean | null;
      sort_order: number | null;
    };

    for (const item of (componentsResult.data ?? []) as ComponentRowRaw[]) {
      const contestId = String(item.contest_id ?? "").trim();
      const componentId = String(item.id ?? "").trim();
      if (!contestId || !componentId) continue;

      const arr = componentsByContestId.get(contestId) ?? [];
      arr.push({
        id: componentId,
        name: String(item.component_name ?? "").trim(),
        threshold: formatMaxTwoDecimals(item.threshold_value),
        periodStart: normalizeDateToMonth(item.period_start),
        periodEnd: normalizeDateToMonth(item.period_end),
        isActive: item.is_active !== false,
        sortOrder: Number(item.sort_order ?? arr.length),
      });
      componentsByContestId.set(contestId, arr);
    }

    const prizesResult = await supabase
      .from("ranking_contest_prizes")
      .select("id, contest_id, place_no, title, amount_mxn, description, sort_order")
      .in("contest_id", contestIds)
      .order("sort_order", { ascending: true });

    if (prizesResult.error) {
      if (isMissingRelationError(prizesResult.error)) {
        const tableName = getMissingRelationName(prizesResult.error) ?? "ranking_contest_prizes";
        return {
          contestsStorageReady: false,
          contestsStorageMessage: `Tabla ${tableName} no creada. Ejecuta docs/ranking-contests-schema.sql.`,
          contests: [],
        };
      }
      throw new Error(`Failed to load ranking contest prizes: ${prizesResult.error.message}`);
    }

    type PrizeRowRaw = {
      id: string | null;
      contest_id: string | null;
      place_no: number | null;
      title: string | null;
      amount_mxn: number | string | null;
      description: string | null;
      sort_order: number | null;
    };

    for (const item of (prizesResult.data ?? []) as PrizeRowRaw[]) {
      const contestId = String(item.contest_id ?? "").trim();
      const prizeId = String(item.id ?? "").trim();
      if (!contestId || !prizeId) continue;

      const arr = prizesByContestId.get(contestId) ?? [];
      arr.push({
        id: prizeId,
        placeNo: Number(item.place_no ?? arr.length + 1),
        title: String(item.title ?? "").trim(),
        amountMxn: formatMaxTwoDecimals(item.amount_mxn),
        description: String(item.description ?? "").trim(),
        sortOrder: Number(item.sort_order ?? arr.length),
      });
      prizesByContestId.set(contestId, arr);
    }
  }

  const contests: RankingContestRow[] = contestsBase.map((row) => ({
    ...row,
    components: componentsByContestId.get(row.id) ?? [],
    prizes: prizesByContestId.get(row.id) ?? [],
  }));

  return {
    contestsStorageReady: true,
    contestsStorageMessage: null,
    contests,
  };
}
