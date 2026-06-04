import { formatPeriodMonthLabel, normalizePeriodMonthInput } from "@/lib/admin/incentive-rules/shared";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CalculationDebuggerPageData,
  CalculationDebuggerProductOption,
  CalculationDebuggerRepresentativeOption,
} from "@/lib/admin/calculation-debugger/types";

type StatusRow = {
  period_month: string | null;
  territorio_individual: string | null;
  nombre_completo: string | null;
  team_id: string | null;
  is_active: boolean | null;
  is_deleted: boolean | null;
};

type RuleVersionRow = {
  period_month: string | null;
  team_id: string | null;
  version_no: number | null;
  created_at: string | null;
  rule_definition_id: string | null;
};

type RuleItemRow = {
  definition_id: string | null;
  product_name: string | null;
};

const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 250;

function normalizePeriod(value: unknown): string {
  return normalizePeriodMonthInput(String(value ?? "")) ?? String(value ?? "").slice(0, 10);
}

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function pickLatestRule(rows: RuleVersionRow[]): Map<string, RuleVersionRow> {
  const output = new Map<string, RuleVersionRow>();
  for (const row of rows) {
    const period = normalizePeriod(row.period_month);
    const teamId = String(row.team_id ?? "").trim();
    if (!period || !teamId) continue;
    const key = `${period}::${teamId}`;
    const current = output.get(key);
    if (!current) {
      output.set(key, row);
      continue;
    }
    const nextVersion = Number(row.version_no ?? 0);
    const currentVersion = Number(current.version_no ?? 0);
    if (nextVersion > currentVersion) {
      output.set(key, row);
      continue;
    }
    if (nextVersion === currentVersion && String(row.created_at ?? "") > String(current.created_at ?? "")) {
      output.set(key, row);
    }
  }
  return output;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

async function fetchAllStatusRows(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
): Promise<StatusRow[]> {
  const rows: StatusRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const result = await supabase
      .from("sales_force_status")
      .select("period_month, territorio_individual, nombre_completo, team_id, is_active, is_deleted")
      .eq("is_deleted", false)
      .eq("is_active", true)
      .order("period_month", { ascending: false })
      .range(from, to);

    if (result.error) {
      throw new Error(`No se pudo leer sales_force_status: ${result.error.message}`);
    }

    const batch = (result.data ?? []) as StatusRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function getCalculationDebuggerPageData(): Promise<CalculationDebuggerPageData> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Admin client no disponible.");
  }

  const statusRows = (await fetchAllStatusRows(supabase)).filter((row) => {
    return normalizePeriod(row.period_month) && String(row.team_id ?? "").trim();
  });

  const periodValues = Array.from(new Set(statusRows.map((row) => normalizePeriod(row.period_month))))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));

  const periods = periodValues.map((value) => ({
    value,
    label: formatPeriodMonthLabel(value),
  }));

  const representatives: CalculationDebuggerRepresentativeOption[] = [];
  const representativeSeen = new Set<string>();
  for (const row of statusRows) {
    const period = normalizePeriod(row.period_month);
    const territory = String(row.territorio_individual ?? "").trim() || null;
    const representativeName = String(row.nombre_completo ?? "").trim() || null;
    const value = territory ?? representativeName ?? "";
    const teamId = String(row.team_id ?? "").trim() || null;
    if (!period || !value || !teamId) continue;
    const key = `${period}::${normalizeKey(value)}`;
    if (representativeSeen.has(key)) continue;
    representativeSeen.add(key);
    representatives.push({
      period,
      value,
      label: territory && representativeName ? `${territory} - ${representativeName}` : value,
      territory,
      representativeName,
      teamId,
    });
  }
  representatives.sort((a, b) => {
    if (a.period !== b.period) return b.period.localeCompare(a.period);
    return a.label.localeCompare(b.label, "es");
  });

  const teamIds = Array.from(new Set(statusRows.map((row) => String(row.team_id ?? "").trim()).filter(Boolean)));
  const products: CalculationDebuggerProductOption[] = [];
  if (teamIds.length > 0) {
    const ruleVersionRows: RuleVersionRow[] = [];
    for (const teamIdChunk of chunkArray(teamIds, IN_CHUNK_SIZE)) {
      const ruleVersionsResult = await supabase
        .from("team_incentive_rule_versions")
        .select("period_month, team_id, version_no, created_at, rule_definition_id")
        .in("team_id", teamIdChunk);

      if (!ruleVersionsResult.error) {
        ruleVersionRows.push(...((ruleVersionsResult.data ?? []) as RuleVersionRow[]));
      }
    }

    if (ruleVersionRows.length > 0) {
      const latestByPeriodTeam = pickLatestRule(ruleVersionRows);
      const definitionIds = Array.from(
        new Set(
          Array.from(latestByPeriodTeam.values())
            .map((row) => String(row.rule_definition_id ?? "").trim())
            .filter(Boolean),
        ),
      );

      if (definitionIds.length > 0) {
        const items: RuleItemRow[] = [];
        for (const definitionIdChunk of chunkArray(definitionIds, IN_CHUNK_SIZE)) {
          const itemsResult = await supabase
            .from("team_rule_definition_items")
            .select("definition_id, product_name")
            .in("definition_id", definitionIdChunk);

          if (!itemsResult.error) {
            items.push(...((itemsResult.data ?? []) as RuleItemRow[]));
          }
        }

        if (items.length > 0) {
          const productsByDefinition = new Map<string, string[]>();
          for (const item of items) {
            const definitionId = String(item.definition_id ?? "").trim();
            const productName = String(item.product_name ?? "").trim();
            if (!definitionId || !productName) continue;
            const current = productsByDefinition.get(definitionId) ?? [];
            if (!current.some((value) => normalizeKey(value) === normalizeKey(productName))) {
              current.push(productName);
            }
            productsByDefinition.set(definitionId, current);
          }

          const productSeen = new Set<string>();
          for (const rep of representatives) {
            if (!rep.teamId) continue;
            const version = latestByPeriodTeam.get(`${rep.period}::${rep.teamId}`);
            const definitionId = String(version?.rule_definition_id ?? "").trim();
            const productNames = productsByDefinition.get(definitionId) ?? [];
            for (const productName of productNames) {
              const key = `${rep.period}::${normalizeKey(rep.value)}::${rep.teamId}::${normalizeKey(productName)}`;
              if (productSeen.has(key)) continue;
              productSeen.add(key);
              products.push({
                period: rep.period,
                representativeValue: rep.value,
                teamId: rep.teamId,
                value: productName,
                label: productName,
              });
            }
          }
        }
      }
    }
  }

  products.sort((a, b) => {
    if (a.period !== b.period) return b.period.localeCompare(a.period);
    if (a.teamId !== b.teamId) return a.teamId.localeCompare(b.teamId, "es");
    return a.label.localeCompare(b.label, "es");
  });

  return { periods, representatives, products };
}
