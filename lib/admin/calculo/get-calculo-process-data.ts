import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 220;

type SalesForceMemberRow = {
  no_empleado: number | string | null;
  nombre_completo: string | null;
  territorio_individual: string | null;
  team_id: string | null;
  is_vacant: boolean | null;
  is_active: boolean | null;
};

type RuleVersionRow = {
  team_id: string | null;
  version_no: number | null;
  created_at: string | null;
  rule_definition_id: string | null;
};

type RuleItemRow = {
  id: number | null;
  definition_id: string | null;
  product_name: string | null;
};

type RuleItemSourceRow = {
  item_id: number | null;
  file_code: string | null;
  file_display: string | null;
  fuente: string | null;
  metric: string | null;
};

type TargetVersionRow = {
  id: string | null;
  version_no: number | null;
};

type TargetRow = {
  territorio_individual: string | null;
  product_name: string | null;
  target: number | string | null;
  brick: string | null;
  cuenta: string | null;
};

type TeamRuleContext = {
  versionNo: number | null;
  sourceFilesCount: number;
  sourceMetricsCount: number;
  sourceFuentesCount: number;
  products: Array<{
    productName: string;
    sourceCount: number;
  }>;
};

export type CalculoProcessMemberRow = {
  noEmpleado: string | null;
  nombreCompleto: string;
  territorioIndividual: string;
  teamId: string;
  rulesVersionNo: number | null;
  ruleProductsCount: number;
  productsWithSourcesCount: number;
  sourceFilesCount: number;
  sourceMetricsCount: number;
  sourceFuentesCount: number;
  targetProductsCovered: number;
  missingTargetProducts: number;
  missingTargetExamples: string[];
  productDetails: Array<{
    productName: string;
    sourceCount: number;
    hasTarget: boolean;
    targetTotal: number;
    targetDetailCount: number;
  }>;
};

export type CalculoProcessData = {
  periodMonth: string;
  storageReady: boolean;
  storageMessages: string[];
  summary: {
    totalMembersInStatus: number;
    eligibleMembers: number;
    excludedVacant: number;
    excludedMissingRouteOrTeam: number;
    teamsDetected: number;
    teamsWithRules: number;
    teamsWithoutRules: number;
    latestTargetVersionNo: number | null;
    requiredMemberProducts: number;
    coveredMemberProducts: number;
    missingMemberProducts: number;
  };
  rows: CalculoProcessMemberRow[];
};

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizePeriod(periodMonthInput: string): string {
  const normalized = normalizePeriodMonthInput(periodMonthInput);
  if (!normalized) {
    throw new Error("Periodo invalido.");
  }
  return normalized;
}

function pickLatestByTeam(rows: RuleVersionRow[]): Map<string, RuleVersionRow> {
  const map = new Map<string, RuleVersionRow>();
  for (const row of rows) {
    const teamId = String(row.team_id ?? "").trim();
    if (!teamId) continue;
    const current = map.get(teamId);
    if (!current) {
      map.set(teamId, row);
      continue;
    }
    const nextVersion = Number(row.version_no ?? 0);
    const currentVersion = Number(current.version_no ?? 0);
    if (nextVersion > currentVersion) {
      map.set(teamId, row);
      continue;
    }
    if (nextVersion === currentVersion && String(row.created_at ?? "") > String(current.created_at ?? "")) {
      map.set(teamId, row);
    }
  }
  return map;
}

function toNumeric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
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

export async function getCalculoProcessData(periodMonthInput: string): Promise<CalculoProcessData> {
  const periodMonth = normalizePeriod(periodMonthInput);
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Admin client not available");
  }

  const storageMessages: string[] = [];
  let storageReady = true;

  const membersResult = await queryWithRetry(() =>
    supabase
      .from("sales_force_status")
      .select("no_empleado, nombre_completo, territorio_individual, team_id, is_vacant, is_active")
      .eq("period_month", periodMonth)
      .eq("is_deleted", false)
      .eq("is_active", true),
  );

  if (membersResult.error) {
    throw new Error(`No se pudo leer sales_force_status: ${membersResult.error.message}`);
  }

  const allMembers = (membersResult.data ?? []) as SalesForceMemberRow[];
  const eligibleMembersRaw: SalesForceMemberRow[] = [];
  let excludedVacant = 0;
  let excludedMissingRouteOrTeam = 0;

  for (const row of allMembers) {
    if (row.is_vacant === true) {
      excludedVacant += 1;
    }
    const route = String(row.territorio_individual ?? "").trim();
    const teamId = String(row.team_id ?? "").trim();
    if (!route || !teamId) {
      excludedMissingRouteOrTeam += 1;
      continue;
    }
    eligibleMembersRaw.push(row);
  }

  const teamIds = Array.from(
    new Set(eligibleMembersRaw.map((row) => String(row.team_id ?? "").trim()).filter((value) => value.length > 0)),
  );

  const latestRuleByTeam = new Map<string, RuleVersionRow>();
  const ruleContextByTeam = new Map<string, TeamRuleContext>();

  if (teamIds.length > 0) {
    const ruleVersionsResult = await queryWithRetry(() =>
      supabase
        .from("team_incentive_rule_versions")
        .select("team_id, version_no, created_at, rule_definition_id")
        .eq("period_month", periodMonth)
        .in("team_id", teamIds),
    );

    if (ruleVersionsResult.error) {
      if (isMissingRelationError(ruleVersionsResult.error)) {
        storageReady = false;
        const tableName = getMissingRelationName(ruleVersionsResult.error) ?? "team_incentive_rule_versions";
        storageMessages.push(`No existe ${tableName}.`);
      } else {
        throw new Error(`No se pudieron leer versiones de reglas: ${ruleVersionsResult.error.message}`);
      }
    } else {
      const ruleRows = (ruleVersionsResult.data ?? []) as RuleVersionRow[];
      const picked = pickLatestByTeam(ruleRows);
      for (const [teamId, row] of picked.entries()) {
        latestRuleByTeam.set(teamId, row);
      }

      const definitionIds = Array.from(
        new Set(
          Array.from(latestRuleByTeam.values())
            .map((row) => String(row.rule_definition_id ?? "").trim())
            .filter((value) => value.length > 0),
        ),
      );

      if (definitionIds.length > 0) {
        const itemsResult = await queryWithRetry(() =>
          supabase
            .from("team_rule_definition_items")
            .select("id, definition_id, product_name")
            .in("definition_id", definitionIds),
        );

        if (itemsResult.error) {
          if (isMissingRelationError(itemsResult.error)) {
            storageReady = false;
            const tableName = getMissingRelationName(itemsResult.error) ?? "team_rule_definition_items";
            storageMessages.push(`No existe ${tableName}.`);
          } else {
            throw new Error(`No se pudieron leer items de reglas: ${itemsResult.error.message}`);
          }
        } else {
          const items = (itemsResult.data ?? []) as RuleItemRow[];
          const itemIds = items
            .map((item) => Number(item.id ?? 0))
            .filter((id) => Number.isFinite(id) && id > 0);

          const sourcesByItemId = new Map<number, RuleItemSourceRow[]>();
          if (itemIds.length > 0) {
            const itemSourcesResult = await queryWithRetry(() =>
              supabase
                .from("team_rule_definition_item_sources")
                .select("item_id, file_code, file_display, fuente, metric")
                .in("item_id", itemIds),
            );

            if (itemSourcesResult.error) {
              if (isMissingRelationError(itemSourcesResult.error)) {
                storageReady = false;
                const tableName =
                  getMissingRelationName(itemSourcesResult.error) ?? "team_rule_definition_item_sources";
                storageMessages.push(`No existe ${tableName}.`);
              } else {
                throw new Error(`No se pudieron leer fuentes de reglas: ${itemSourcesResult.error.message}`);
              }
            } else {
              for (const row of (itemSourcesResult.data ?? []) as RuleItemSourceRow[]) {
                const itemId = Number(row.item_id ?? 0);
                if (!Number.isFinite(itemId) || itemId <= 0) continue;
                const current = sourcesByItemId.get(itemId) ?? [];
                current.push(row);
                sourcesByItemId.set(itemId, current);
              }
            }
          }

          const itemsByDefinition = new Map<string, RuleItemRow[]>();
          for (const item of items) {
            const definitionId = String(item.definition_id ?? "").trim();
            if (!definitionId) continue;
            const current = itemsByDefinition.get(definitionId) ?? [];
            current.push(item);
            itemsByDefinition.set(definitionId, current);
          }

          for (const [teamId, version] of latestRuleByTeam.entries()) {
            const definitionId = String(version.rule_definition_id ?? "").trim();
            const ruleItems = itemsByDefinition.get(definitionId) ?? [];
            const productMap = new Map<string, {
              sourceCount: number;
              sourceFileSet: Set<string>;
              sourceMetricSet: Set<string>;
              sourceFuenteSet: Set<string>;
            }>();

            for (const item of ruleItems) {
              const itemId = Number(item.id ?? 0);
              const productName = normalizeKey(item.product_name);
              if (!productName) continue;
              const sourceRows = Number.isFinite(itemId) && itemId > 0 ? (sourcesByItemId.get(itemId) ?? []) : [];
              const current = productMap.get(productName) ?? {
                sourceCount: 0,
                sourceFileSet: new Set<string>(),
                sourceMetricSet: new Set<string>(),
                sourceFuenteSet: new Set<string>(),
              };
              current.sourceCount += sourceRows.length;
              for (const source of sourceRows) {
                const fileValue = normalizeKey(source.file_code || source.file_display);
                const metricValue = normalizeKey(source.metric);
                const fuenteValue = normalizeKey(source.fuente);
                if (fileValue) current.sourceFileSet.add(fileValue);
                if (metricValue) current.sourceMetricSet.add(metricValue);
                if (fuenteValue) current.sourceFuenteSet.add(fuenteValue);
              }
              productMap.set(productName, current);
            }

            const products = Array.from(productMap.entries())
              .map(([productName, sourceInfo]) => ({
                productName,
                sourceCount: sourceInfo.sourceCount,
              }))
              .sort((a, b) => a.productName.localeCompare(b.productName, "es"));

            const sourceFileUnion = new Set<string>();
            const sourceMetricUnion = new Set<string>();
            const sourceFuenteUnion = new Set<string>();
            for (const info of productMap.values()) {
              for (const item of info.sourceFileSet) sourceFileUnion.add(item);
              for (const item of info.sourceMetricSet) sourceMetricUnion.add(item);
              for (const item of info.sourceFuenteSet) sourceFuenteUnion.add(item);
            }

            ruleContextByTeam.set(teamId, {
              versionNo: Number(version.version_no ?? 0) || null,
              sourceFilesCount: sourceFileUnion.size,
              sourceMetricsCount: sourceMetricUnion.size,
              sourceFuentesCount: sourceFuenteUnion.size,
              products,
            });
          }
        }
      }
    }
  }

  let latestTargetVersionNo: number | null = null;
  const targetsByRouteProduct = new Map<string, { targetTotal: number; detailCount: number }>();

  const latestTargetVersionResult = await queryWithRetry(() =>
    supabase
      .from("team_objective_target_versions")
      .select("id, version_no")
      .eq("period_month", periodMonth)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle<TargetVersionRow>(),
  );

  if (latestTargetVersionResult.error) {
    if (isMissingRelationError(latestTargetVersionResult.error)) {
      storageReady = false;
      const tableName = getMissingRelationName(latestTargetVersionResult.error) ?? "team_objective_target_versions";
      storageMessages.push(`No existe ${tableName}.`);
    } else {
      throw new Error(
        `No se pudo leer version de objetivos para process: ${latestTargetVersionResult.error.message}`,
      );
    }
  } else {
    const targetVersionId = String(latestTargetVersionResult.data?.id ?? "").trim();
    latestTargetVersionNo = Number(latestTargetVersionResult.data?.version_no ?? 0) || null;
    if (targetVersionId) {
      const targetRowsResult = await queryWithRetry(() =>
        supabase
          .from("team_objective_targets")
          .select("territorio_individual, product_name, target, brick, cuenta")
          .eq("version_id", targetVersionId),
      );

      if (targetRowsResult.error) {
        if (isMissingRelationError(targetRowsResult.error)) {
          storageReady = false;
          const tableName = getMissingRelationName(targetRowsResult.error) ?? "team_objective_targets";
          storageMessages.push(`No existe ${tableName}.`);
        } else {
          throw new Error(`No se pudieron leer objetivos para process: ${targetRowsResult.error.message}`);
        }
      } else {
        for (const row of (targetRowsResult.data ?? []) as TargetRow[]) {
          const routeKey = normalizeKey(row.territorio_individual);
          const productKey = normalizeKey(row.product_name);
          if (!routeKey || !productKey) continue;
          const key = `${routeKey}::${productKey}`;
          const current = targetsByRouteProduct.get(key) ?? { targetTotal: 0, detailCount: 0 };
          current.targetTotal += toNumeric(row.target);
          current.detailCount += 1;
          targetsByRouteProduct.set(key, current);
        }
      }
    }
  }

  const rows: CalculoProcessMemberRow[] = [];
  let requiredMemberProducts = 0;
  let coveredMemberProducts = 0;
  let missingMemberProducts = 0;

  for (const member of eligibleMembersRaw) {
    const route = String(member.territorio_individual ?? "").trim();
    const teamId = String(member.team_id ?? "").trim();
    const teamRule = ruleContextByTeam.get(teamId);
    const products = teamRule?.products ?? [];
    const routeKey = normalizeKey(route);

    let targetCovered = 0;
    const missingExamples: string[] = [];
    const productDetails: CalculoProcessMemberRow["productDetails"] = [];

    for (const product of products) {
      const targetKey = `${routeKey}::${normalizeKey(product.productName)}`;
      const targetMatch = targetsByRouteProduct.get(targetKey);
      const targetTotal = targetMatch?.targetTotal ?? 0;
      const targetDetailCount = targetMatch?.detailCount ?? 0;
      const hasTarget = targetTotal > 0;

      if (hasTarget) {
        targetCovered += 1;
      } else if (missingExamples.length < 3) {
        missingExamples.push(product.productName);
      }

      productDetails.push({
        productName: product.productName,
        sourceCount: product.sourceCount,
        hasTarget,
        targetTotal,
        targetDetailCount,
      });
    }

    const missingTargetCount = Math.max(0, products.length - targetCovered);
    requiredMemberProducts += products.length;
    coveredMemberProducts += targetCovered;
    missingMemberProducts += missingTargetCount;

    let productsWithSourcesCount = 0;
    for (const product of products) {
      if (product.sourceCount > 0) productsWithSourcesCount += 1;
    }

    rows.push({
      noEmpleado: String(member.no_empleado ?? "").trim() || null,
      nombreCompleto: String(member.nombre_completo ?? "").trim() || "(Sin nombre)",
      territorioIndividual: route,
      teamId,
      rulesVersionNo: teamRule?.versionNo ?? null,
      ruleProductsCount: products.length,
      productsWithSourcesCount,
      sourceFilesCount: teamRule?.sourceFilesCount ?? 0,
      sourceMetricsCount: teamRule?.sourceMetricsCount ?? 0,
      sourceFuentesCount: teamRule?.sourceFuentesCount ?? 0,
      targetProductsCovered: targetCovered,
      missingTargetProducts: missingTargetCount,
      missingTargetExamples: missingExamples,
      productDetails,
    });
  }

  rows.sort((a, b) => {
    if (a.teamId !== b.teamId) return a.teamId.localeCompare(b.teamId, "es");
    return a.territorioIndividual.localeCompare(b.territorioIndividual, "es");
  });

  const teamsWithRules = Array.from(new Set(rows.filter((row) => row.rulesVersionNo !== null).map((row) => row.teamId))).length;
  const teamsDetected = Array.from(new Set(rows.map((row) => row.teamId))).length;

  return {
    periodMonth,
    storageReady,
    storageMessages,
    summary: {
      totalMembersInStatus: allMembers.length,
      eligibleMembers: eligibleMembersRaw.length,
      excludedVacant,
      excludedMissingRouteOrTeam,
      teamsDetected,
      teamsWithRules,
      teamsWithoutRules: Math.max(0, teamsDetected - teamsWithRules),
      latestTargetVersionNo,
      requiredMemberProducts,
      coveredMemberProducts,
      missingMemberProducts,
    },
    rows,
  };
}
