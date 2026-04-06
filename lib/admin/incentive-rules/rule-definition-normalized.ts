import { TEAM_RULE_REFERENCE_VALUES } from "@/lib/admin/incentive-rules/rule-catalog";
import { isMissingRelationError, normalizeSourceFileCode } from "@/lib/admin/incentive-rules/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

type DefinitionRow = {
  id: string;
  period_month: string;
  team_id: string;
  schema_version: string | null;
  model_name: string | null;
  description: string | null;
};

type ItemRow = {
  id: number;
  definition_id: string;
  rule_order: number;
  rule_code: string | null;
  product_name: string | null;
  plan_type_name: string | null;
  candado: string | null;
  cobertura_candado: number | string | null;
  distribucion_no_asignada: boolean;
  prod_weight: number | string | null;
  calcular_en_valores: boolean;
  precio_promedio: number | string | null;
  agrupador: string | null;
  curva_pago: string | null;
  elemento: string | null;
};

type ItemSourceRow = {
  item_id: number;
  source_order: number;
  file_code: string | null;
  file_display: string | null;
  fuente: string | null;
  metric: string | null;
  molecula_producto: string | null;
};

type ItemMetaRow = {
  item_id: number;
  ranking: string | null;
  puntos_ranking_lvu: number | null;
  extra_fields: JsonRecord | null;
};

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized = raw.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return false;
  return raw === "true" || raw === "1" || raw === "si" || raw === "yes";
}

function normalizeText(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function normalizeJsonRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function extractSourcesFromRule(rule: JsonRecord): ItemSourceRow[] {
  const sources: ItemSourceRow[] = [];

  if (Array.isArray(rule.sources)) {
    for (const sourceItem of rule.sources) {
      if (!sourceItem || typeof sourceItem !== "object") continue;
      const source = sourceItem as JsonRecord;
      const sourceOrder = Number(source.order ?? 0);
      sources.push({
        item_id: 0,
        source_order: Number.isFinite(sourceOrder) && sourceOrder > 0 ? sourceOrder : sources.length + 1,
        file_code: normalizeSourceFileCode(source.file) || null,
        file_display: normalizeText(source.file),
        fuente: normalizeText(source.fuente),
        metric: normalizeText(source.metric),
        molecula_producto: normalizeText(source.molecula_producto),
      });
    }
  }

  if (sources.length === 0) {
    for (let index = 1; index <= 8; index += 1) {
      const fileDisplay = normalizeText(rule[`file${index}`]);
      const fuente = normalizeText(rule[`fuente${index}`]);
      const metric = normalizeText(rule[`metric${index}`]);
      const molecula = normalizeText(rule[`molecula_producto${index}`]);

      if (!fileDisplay && !fuente && !metric && !molecula) continue;

      sources.push({
        item_id: 0,
        source_order: index,
        file_code: normalizeSourceFileCode(fileDisplay) || null,
        file_display: fileDisplay,
        fuente,
        metric,
        molecula_producto: molecula,
      });
    }
  }

  return sources;
}

export async function createNormalizedRuleDefinition(params: {
  supabase: SupabaseClient;
  teamId: string;
  periodMonth: string;
  sourceType: string;
  createdBy: string | null;
  ruleDefinition: JsonRecord | null;
}): Promise<string> {
  const definition = params.ruleDefinition ?? {};
  const meta =
    definition.meta && typeof definition.meta === "object" && !Array.isArray(definition.meta)
      ? (definition.meta as JsonRecord)
      : {};

  const definitionInsertResult = await params.supabase
    .from("team_rule_definitions")
    .insert({
      period_month: params.periodMonth,
      team_id: params.teamId,
      schema_version: normalizeText(definition.schema_version) ?? "team_rules_v2",
      model_name: normalizeText(meta.model_name),
      description: normalizeText(meta.description),
      source_type: params.sourceType,
      created_by: params.createdBy,
    })
    .select("id")
    .single();

  if (definitionInsertResult.error) {
    throw new Error(`No se pudo crear team_rule_definitions: ${definitionInsertResult.error.message}`);
  }

  const definitionId = String(definitionInsertResult.data?.id ?? "").trim();
  if (!definitionId) {
    throw new Error("No se obtuvo rule_definition_id al crear team_rule_definitions.");
  }

  const rules = Array.isArray(definition.rules) ? definition.rules : [];
  const pendingSourceInserts: ItemSourceRow[] = [];
  const pendingMetaUpserts: ItemMetaRow[] = [];

  for (let index = 0; index < rules.length; index += 1) {
    const item = rules[index];
    if (!item || typeof item !== "object") continue;
    const rule = item as JsonRecord;

    const insertItemResult = await params.supabase
      .from("team_rule_definition_items")
      .insert({
        definition_id: definitionId,
        rule_order: index + 1,
        rule_code: normalizeText(rule.rule_id ?? rule.rule_code),
        product_name: normalizeText(rule.product_name),
        plan_type_name: normalizeText(rule.plan_type_name),
        candado: normalizeText(rule.candado),
        cobertura_candado: parseOptionalNumber(rule.cobertura_candado),
        distribucion_no_asignada: parseBooleanLike(rule.distribucion_no_asignada),
        prod_weight: parseOptionalNumber(rule.prod_weight),
        calcular_en_valores: parseBooleanLike(rule.calcular_en_valores),
        precio_promedio: parseOptionalNumber(rule.precio_promedio),
        agrupador: normalizeText(rule.agrupador),
        curva_pago: normalizeText(rule.curva_pago_id) ?? normalizeText(rule.curva_pago),
        elemento: normalizeText(rule.elemento),
      })
      .select("id")
      .single();

    if (insertItemResult.error) {
      throw new Error(
        `No se pudo crear team_rule_definition_items (team ${params.teamId}, regla ${index + 1}): ${insertItemResult.error.message}`,
      );
    }

    const itemId = Number(insertItemResult.data?.id ?? 0);
    const itemSources = extractSourcesFromRule(rule).map((source) => ({
      ...source,
      item_id: itemId,
    }));
    pendingSourceInserts.push(...itemSources);

    const ranking = normalizeText(rule.ranking);
    const puntosRankingLvu = parseOptionalNumber(rule.puntos_ranking_lvu);
    const extraFields = normalizeJsonRecord(rule.extra_fields);
    if (ranking || puntosRankingLvu !== null || extraFields) {
      pendingMetaUpserts.push({
        item_id: itemId,
        ranking,
        puntos_ranking_lvu: puntosRankingLvu,
        extra_fields: extraFields,
      });
    }
  }

  if (pendingSourceInserts.length > 0) {
    const insertSourcesResult = await params.supabase
      .from("team_rule_definition_item_sources")
      .insert(pendingSourceInserts);

    if (insertSourcesResult.error && !isMissingRelationError(insertSourcesResult.error)) {
      throw new Error(
        `No se pudo crear team_rule_definition_item_sources: ${insertSourcesResult.error.message}`,
      );
    }
  }

  if (pendingMetaUpserts.length > 0) {
    const upsertMetaResult = await params.supabase
      .from("team_rule_definition_item_meta")
      .upsert(pendingMetaUpserts, { onConflict: "item_id" });

    if (upsertMetaResult.error && !isMissingRelationError(upsertMetaResult.error)) {
      throw new Error(
        `No se pudo crear team_rule_definition_item_meta: ${upsertMetaResult.error.message}`,
      );
    }
  }

  return definitionId;
}

export async function loadRuleDefinitionsByIds(params: {
  supabase: SupabaseClient;
  definitionIds: string[];
}): Promise<Map<string, JsonRecord>> {
  const uniqueDefinitionIds = Array.from(
    new Set(params.definitionIds.map((id) => String(id ?? "").trim()).filter((id) => id.length > 0)),
  );

  const output = new Map<string, JsonRecord>();
  if (uniqueDefinitionIds.length === 0) {
    return output;
  }

  const definitionsResult = await params.supabase
    .from("team_rule_definitions")
    .select("id, period_month, team_id, schema_version, model_name, description")
    .in("id", uniqueDefinitionIds);

  if (definitionsResult.error) {
    throw new Error(`No se pudo leer team_rule_definitions: ${definitionsResult.error.message}`);
  }

  const definitionRows = (definitionsResult.data ?? []) as DefinitionRow[];
  const foundDefinitionIds = definitionRows.map((row) => row.id);
  if (foundDefinitionIds.length === 0) {
    return output;
  }

  const itemsResult = await params.supabase
    .from("team_rule_definition_items")
    .select(
      "id, definition_id, rule_order, rule_code, product_name, plan_type_name, candado, cobertura_candado, distribucion_no_asignada, prod_weight, calcular_en_valores, precio_promedio, agrupador, curva_pago, elemento",
    )
    .in("definition_id", foundDefinitionIds)
    .order("definition_id", { ascending: true })
    .order("rule_order", { ascending: true });

  if (itemsResult.error) {
    throw new Error(`No se pudo leer team_rule_definition_items: ${itemsResult.error.message}`);
  }

  const items = (itemsResult.data ?? []) as ItemRow[];
  const itemIds = items.map((item) => item.id);
  const sourcesByItemId = new Map<number, ItemSourceRow[]>();
  const metaByItemId = new Map<number, ItemMetaRow>();

  if (itemIds.length > 0) {
    const sourcesResult = await params.supabase
      .from("team_rule_definition_item_sources")
      .select("item_id, source_order, file_code, file_display, fuente, metric, molecula_producto")
      .in("item_id", itemIds)
      .order("item_id", { ascending: true })
      .order("source_order", { ascending: true });

    if (!sourcesResult.error) {
      const sourceRows = (sourcesResult.data ?? []) as ItemSourceRow[];
      for (const row of sourceRows) {
        const current = sourcesByItemId.get(row.item_id) ?? [];
        current.push(row);
        sourcesByItemId.set(row.item_id, current);
      }
    } else if (!isMissingRelationError(sourcesResult.error)) {
      throw new Error(
        `No se pudo leer team_rule_definition_item_sources: ${sourcesResult.error.message}`,
      );
    }

    const metaResult = await params.supabase
      .from("team_rule_definition_item_meta")
      .select("item_id, ranking, puntos_ranking_lvu, extra_fields")
      .in("item_id", itemIds);

    if (!metaResult.error) {
      const metaRows = (metaResult.data ?? []) as Array<{
        item_id: number;
        ranking: string | null;
        puntos_ranking_lvu: number | string | null;
        extra_fields: JsonRecord | null;
      }>;
      for (const row of metaRows) {
        metaByItemId.set(row.item_id, {
          item_id: row.item_id,
          ranking: normalizeText(row.ranking),
          puntos_ranking_lvu: parseOptionalNumber(row.puntos_ranking_lvu),
          extra_fields: normalizeJsonRecord(row.extra_fields),
        });
      }
    } else if (!isMissingRelationError(metaResult.error)) {
      throw new Error(
        `No se pudo leer team_rule_definition_item_meta: ${metaResult.error.message}`,
      );
    }
  }

  const itemsByDefinitionId = new Map<string, ItemRow[]>();
  for (const row of items) {
    const current = itemsByDefinitionId.get(row.definition_id) ?? [];
    current.push(row);
    itemsByDefinitionId.set(row.definition_id, current);
  }

  for (const definition of definitionRows) {
    const definitionItems = itemsByDefinitionId.get(definition.id) ?? [];
    const rules = definitionItems.map((item) => {
      const rule: JsonRecord = {
        team_id: definition.team_id,
        rule_id: item.rule_code ?? "",
        product_name: item.product_name ?? "",
        plan_type_name: item.plan_type_name ?? "",
        candado: item.candado ?? "",
        cobertura_candado: item.cobertura_candado,
        distribucion_no_asignada: Boolean(item.distribucion_no_asignada),
        prod_weight: item.prod_weight,
        calcular_en_valores: Boolean(item.calcular_en_valores),
        precio_promedio: item.precio_promedio,
        agrupador: item.agrupador ?? "",
        curva_pago: item.curva_pago ?? "",
        curva_pago_id: item.curva_pago ?? "",
        elemento: item.elemento ?? "",
      };

      const sources = (sourcesByItemId.get(item.id) ?? []).map((source, index) => ({
        order: source.source_order ?? index + 1,
        file: source.file_display ?? source.file_code ?? "",
        fuente: source.fuente ?? "",
        molecula_producto: source.molecula_producto ?? "",
        metric: source.metric ?? "",
      }));

      if (sources.length > 0) {
        rule.sources = sources;
        for (let index = 0; index < Math.min(8, sources.length); index += 1) {
          const source = sources[index];
          const legacyNumber = index + 1;
          rule[`file${legacyNumber}`] = source.file ?? "";
          rule[`fuente${legacyNumber}`] = source.fuente ?? "";
          rule[`molecula_producto${legacyNumber}`] = source.molecula_producto ?? "";
          rule[`metric${legacyNumber}`] = source.metric ?? "";
        }
      }

      const meta = metaByItemId.get(item.id);
      if (meta) {
        if (meta.ranking) {
          rule.ranking = meta.ranking;
        }
        if (meta.puntos_ranking_lvu !== null) {
          rule.puntos_ranking_lvu = meta.puntos_ranking_lvu;
        }
        if (meta.extra_fields) {
          rule.extra_fields = meta.extra_fields;
        }
      }

      return rule;
    });

    output.set(definition.id, {
      schema_version: definition.schema_version ?? "team_rules_v2",
      meta: {
        team_id: definition.team_id,
        period_month: definition.period_month,
        model_name: definition.model_name ?? "",
        description: definition.description ?? "",
      },
      reference_values: TEAM_RULE_REFERENCE_VALUES,
      rules,
    });
  }

  return output;
}
