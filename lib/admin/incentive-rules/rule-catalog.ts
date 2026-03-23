export type TeamRuleFieldType = "text" | "number" | "boolean";

export type TeamRuleFieldGuideItem = {
  key: string;
  label: string;
  type: TeamRuleFieldType;
  required: boolean;
  description: string;
};

export const TEAM_RULE_SCHEMA_VERSION = "team_rules_v1";

// Base field guide derived from Reglas_Team_ID.xlsx (sheets NOV25ORIGINAL / SEP25).
export const TEAM_RULE_FIELD_GUIDE: TeamRuleFieldGuideItem[] = [
  { key: "team_id", label: "Team ID", type: "text", required: true, description: "Identificador del team." },
  { key: "plan_type_name", label: "Plan type", type: "text", required: true, description: "Tipo de plan (market share, sales vs target)." },
  { key: "product_name", label: "Product", type: "text", required: true, description: "Nombre del producto o KPI de producto." },
  { key: "candado", label: "Candado", type: "text", required: false, description: "Regla de candado para payout." },
  { key: "cobertura_candado", label: "Cobertura candado", type: "number", required: false, description: "Cobertura minima (ej. 0.6)." },
  { key: "distribucion_no_asignada", label: "Distribucion no asignada", type: "boolean", required: false, description: "Bandera para distribucion no asignada." },
  { key: "prod_weight", label: "Peso producto", type: "number", required: true, description: "Peso del producto dentro del plan." },
  { key: "agrupador", label: "Agrupador", type: "text", required: true, description: "Agrupador funcional (MS/GOVERNMENT/PRIVATE)." },
  { key: "curva_pago", label: "Curva pago", type: "text", required: true, description: "Curva de pago aplicable." },
  { key: "elemento", label: "Elemento", type: "text", required: true, description: "Elemento del calculo (MS, INTERNAL SALES, DDD, B2B)." },
  { key: "source_block.file", label: "Source file", type: "text", required: false, description: "Archivo/fuente de informacion para calculo." },
  { key: "source_block.fuente", label: "Source type", type: "text", required: false, description: "Tipo de fuente (DESPLAZAMIENTO, ORDENES, DF, etc.)." },
  { key: "source_block.molecula_producto", label: "Molecula producto", type: "text", required: false, description: "Molecula asociada al bloque de fuente." },
  { key: "source_block.metric", label: "Metrica", type: "text", required: false, description: "Metrica usada para el calculo en ese bloque." },
];

export const TEAM_RULE_REFERENCE_VALUES = {
  plan_type_name: ["MARKET SHARE", "SALES VS. TARGET PLAN"],
  agrupador: ["MS", "GOVERNMENT", "PRIVATE"],
  curva_pago: ["Publico", "OG", "Launch", "Privado"],
  elemento: ["MS", "INTERNAL SALES", "DDD", "B2B"],
  fuente: ["DESPLAZAMIENTO", "ORDENES", "DF", "DDD", "B2B"],
  metrica: ["UNIDADES", "UNITS"],
  candado: ["BONSPRI_GOV"],
};

export function createInitialTeamRuleDefinition(params: {
  teamId: string;
  periodMonth: string;
}) {
  return {
    schema_version: TEAM_RULE_SCHEMA_VERSION,
    meta: {
      team_id: params.teamId,
      period_month: params.periodMonth,
      template_origin: "Reglas_Team_ID.xlsx",
      template_sheets: ["NOV25ORIGINAL", "SEP25"],
      model_name: "draft-v1",
      description: "Base inicial para configurar reglas por team y periodo.",
    },
    field_guide: TEAM_RULE_FIELD_GUIDE,
    reference_values: TEAM_RULE_REFERENCE_VALUES,
    validation_hints: [
      "prod_weight por team normalmente suma 1.0",
      "cobertura_candado suele estar entre 0 y 1",
      "versionar cada ajuste para trazabilidad",
    ],
    rules: [
      {
        team_id: params.teamId,
        plan_type_name: "",
        product_name: "",
        candado: "",
        cobertura_candado: null,
        distribucion_no_asignada: false,
        prod_weight: null,
        agrupador: "",
        curva_pago: "",
        elemento: "",
        file1: "",
        fuente1: "",
        molecula_producto1: "",
        metric1: "",
        file2: "",
        fuente2: "",
        molecula_producto2: "",
        metric2: "",
        file3: "",
        fuente3: "",
        molecula_producto3: "",
        metric3: "",
      },
    ],
  };
}
