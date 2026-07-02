import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentPeriodMonth,
  getMissingRelationName,
  isMissingRelationError,
  normalizePeriodMonthInput,
} from "@/lib/admin/incentive-rules/shared";
import {
  computeEffectivePeriodCut,
  isBeforeEffectivePeriodCut,
  normalizeProductNameKey,
} from "@/lib/admin/period-settings/effective-period";
import {
  buildDefaultPeriodSettings,
  GLOBAL_PERIOD_SETTINGS_MONTH,
  mapPeriodSettingsRow,
  type PeriodSettings,
} from "@/lib/admin/period-settings/load-period-settings";

type PeriodRow = {
  period_month: string | null;
};

type SettingsRow = {
  period_month: string | null;
  result_from_hire_date_enabled: boolean | null;
  hire_date_cutoff_day: number | string | null;
  affected_product_names: string[] | null;
};

type RuleVersionRow = {
  team_id: string | null;
  version_no: number | null;
  created_at: string | null;
  rule_definition_id: string | null;
};

type RuleItemRow = {
  definition_id: string | null;
  product_name: string | null;
};

type StatusSampleRow = {
  territorio_individual: string | null;
  nombre_completo: string | null;
  team_id: string | null;
  fecha_ingreso: string | null;
};

export type PeriodSettingsPageData = {
  periodMonth: string;
  availablePeriods: string[];
  settings: PeriodSettings;
  storageReady: boolean;
  storageMessage: string | null;
  productOptions: string[];
  productsMessage: string | null;
  sampleRows: Array<{
    territorioIndividual: string;
    nombreCompleto: string | null;
    teamId: string | null;
    fechaIngreso: string | null;
    effectivePeriodCut: string | null;
    includedInSelectedPeriod: boolean;
  }>;
};

function uniqueNormalizedPeriods(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizePeriodMonthInput(String(value ?? "").trim()))
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => b.localeCompare(a));
}

function pickLatestRuleByTeam(rows: RuleVersionRow[]): RuleVersionRow[] {
  const byTeam = new Map<string, RuleVersionRow>();
  for (const row of rows) {
    const teamId = String(row.team_id ?? "").trim();
    if (!teamId) continue;
    const current = byTeam.get(teamId);
    if (!current) {
      byTeam.set(teamId, row);
      continue;
    }

    const nextVersion = Number(row.version_no ?? 0);
    const currentVersion = Number(current.version_no ?? 0);
    if (nextVersion > currentVersion) {
      byTeam.set(teamId, row);
      continue;
    }
    if (nextVersion === currentVersion) {
      const nextCreated = String(row.created_at ?? "");
      const currentCreated = String(current.created_at ?? "");
      if (nextCreated > currentCreated) byTeam.set(teamId, row);
    }
  }
  return Array.from(byTeam.values());
}

function addProductName(output: Map<string, string>, value: unknown): void {
  const productName = String(value ?? "").trim();
  const key = normalizeProductNameKey(productName);
  if (!key || output.has(key)) return;
  output.set(key, productName);
}

export async function getPeriodSettingsPageData(periodMonthInput?: string | null): Promise<PeriodSettingsPageData> {
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Admin client not available");

  const periodsResult = await supabase
    .from("sales_force_status")
    .select("period_month")
    .eq("is_deleted", false)
    .order("period_month", { ascending: false });

  if (periodsResult.error) {
    throw new Error(`No se pudieron cargar periodos desde sales_force_status: ${periodsResult.error.message}`);
  }

  const availablePeriods = uniqueNormalizedPeriods(((periodsResult.data ?? []) as PeriodRow[]).map((row) => row.period_month));
  const requestedPeriod = normalizePeriodMonthInput(periodMonthInput);
  const periodMonth = requestedPeriod ?? availablePeriods[0] ?? getCurrentPeriodMonth();

  let storageReady = true;
  let storageMessage: string | null = null;
  let settings = buildDefaultPeriodSettings(periodMonth);

  const settingsResult = await supabase
    .from("team_incentive_period_settings")
    .select("period_month, result_from_hire_date_enabled, hire_date_cutoff_day, affected_product_names")
    .eq("period_month", GLOBAL_PERIOD_SETTINGS_MONTH)
    .maybeSingle();

  if (settingsResult.error) {
    if (isMissingRelationError(settingsResult.error)) {
      storageReady = false;
      const tableName = getMissingRelationName(settingsResult.error) ?? "team_incentive_period_settings";
      storageMessage = `La tabla ${tableName} aun no existe. Ejecuta docs/team-incentive-period-settings-schema.sql para habilitar este modulo.`;
    } else {
      throw new Error(`No se pudo leer Period Settings: ${settingsResult.error.message}`);
    }
  } else {
    if (settingsResult.data) {
      settings = mapPeriodSettingsRow(settingsResult.data as SettingsRow, periodMonth);
    } else {
      const legacySettingsResult = await supabase
        .from("team_incentive_period_settings")
        .select("period_month, result_from_hire_date_enabled, hire_date_cutoff_day, affected_product_names")
        .eq("period_month", periodMonth)
        .maybeSingle();

      if (legacySettingsResult.error) {
        if (!isMissingRelationError(legacySettingsResult.error)) {
          throw new Error(`No se pudo leer Period Settings: ${legacySettingsResult.error.message}`);
        }
      } else {
        settings = mapPeriodSettingsRow((legacySettingsResult.data ?? null) as SettingsRow | null, periodMonth);
      }
    }
  }

  const productNamesByKey = new Map<string, string>();
  let productsMessage: string | null = null;

  for (const productName of settings.affectedProductNames) {
    addProductName(productNamesByKey, productName);
  }

  const ruleVersionsResult = await supabase
    .from("team_incentive_rule_versions")
    .select("team_id, version_no, created_at, rule_definition_id")
    .eq("period_month", periodMonth);

  if (ruleVersionsResult.error) {
    if (isMissingRelationError(ruleVersionsResult.error)) {
      productsMessage = "No se pudieron leer Pay Components porque faltan tablas de reglas.";
    } else {
      productsMessage = `No se pudieron cargar productos desde Pay Components: ${ruleVersionsResult.error.message}`;
    }
  } else {
    const latestRules = pickLatestRuleByTeam((ruleVersionsResult.data ?? []) as RuleVersionRow[]);
    const definitionIds = Array.from(
      new Set(
        latestRules
          .map((row) => String(row.rule_definition_id ?? "").trim())
          .filter((value) => value.length > 0),
      ),
    );

    if (definitionIds.length > 0) {
      const itemsResult = await supabase
        .from("team_rule_definition_items")
        .select("definition_id, product_name")
        .in("definition_id", definitionIds);

      if (itemsResult.error) {
        productsMessage = isMissingRelationError(itemsResult.error)
          ? "No se pudieron leer productos porque falta team_rule_definition_items."
          : `No se pudieron cargar productos: ${itemsResult.error.message}`;
      } else {
        for (const row of (itemsResult.data ?? []) as RuleItemRow[]) {
          addProductName(productNamesByKey, row.product_name);
        }
      }
    } else {
      productsMessage = "No hay Pay Components cargados para este periodo.";
    }
  }

  const statusResult = await supabase
    .from("sales_force_status")
    .select("territorio_individual, nombre_completo, team_id, fecha_ingreso")
    .eq("period_month", periodMonth)
    .eq("is_deleted", false)
    .eq("is_active", true)
    .order("nombre_completo", { ascending: true })
    .limit(12);

  if (statusResult.error) {
    throw new Error(`No se pudo cargar muestra de Status: ${statusResult.error.message}`);
  }

  const sampleRows = ((statusResult.data ?? []) as StatusSampleRow[])
    .map((row) => {
      const effectivePeriodCut = computeEffectivePeriodCut({
        hireDate: row.fecha_ingreso,
        cutoffDay: settings.hireDateCutoffDay,
        periodMonth,
      });
      return {
        territorioIndividual: String(row.territorio_individual ?? "").trim(),
        nombreCompleto: row.nombre_completo ?? null,
        teamId: row.team_id ?? null,
        fechaIngreso: row.fecha_ingreso ?? null,
        effectivePeriodCut,
        includedInSelectedPeriod: !isBeforeEffectivePeriodCut(periodMonth, effectivePeriodCut),
      };
    })
    .filter((row) => row.territorioIndividual.length > 0);

  return {
    periodMonth,
    availablePeriods,
    settings,
    storageReady,
    storageMessage,
    productOptions: Array.from(productNamesByKey.values()).sort((a, b) => a.localeCompare(b)),
    productsMessage,
    sampleRows,
  };
}
