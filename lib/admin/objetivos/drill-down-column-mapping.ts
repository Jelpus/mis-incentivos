export type DrillDownRequiredField = "ruta" | "productName" | "cuota";

export type DrillDownOptionalField =
  | "mes"
  | "canal"
  | "producto"
  | "metodo"
  | "brick"
  | "cuenta"
  | "salesCredity";

export type DrillDownMappingField =
  | DrillDownRequiredField
  | DrillDownOptionalField;

export type DrillDownColumnMapping = Partial<
  Record<DrillDownMappingField, string>
>;

const SPANISH_MONTH_HEADERS = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
] as const;

export const DRILL_DOWN_REQUIRED_FIELDS: DrillDownRequiredField[] = [
  "ruta",
  "productName",
  "cuota",
];

export const DRILL_DOWN_OPTIONAL_FIELDS: DrillDownOptionalField[] = [
  "mes",
  "canal",
  "producto",
  "metodo",
  "brick",
  "cuenta",
  "salesCredity",
];

export function normalizeDrillDownHeader(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function selectedMonthHeader(periodMonth: string): string | null {
  const month = Number(String(periodMonth ?? "").slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return SPANISH_MONTH_HEADERS[month - 1];
}

export function resolveDrillDownColumn(
  headerValue: string,
  selectedPeriodMonth?: string | null,
): DrillDownMappingField | null {
  const headerKey = normalizeDrillDownHeader(headerValue);
  if (!headerKey) return null;

  if (headerKey === "RUTA" || headerKey === "TERRITORIO_INDIVIDUAL") return "ruta";
  if (
    headerKey === "PRODUCT_NAME" ||
    headerKey === "PRODUCTNAME" ||
    headerKey === "PRODUCTO_NOMBRE"
  ) {
    return "productName";
  }
  if (
    headerKey === "CUOTA" ||
    headerKey === "CUOTA_YTD" ||
    headerKey === "TARGET" ||
    headerKey === "OBJETIVO"
  ) {
    return "cuota";
  }

  const periodHeader = selectedMonthHeader(selectedPeriodMonth ?? "");
  if (periodHeader && headerKey === periodHeader) return "cuota";

  if (headerKey === "MES" || headerKey === "MONTH" || headerKey === "PERIODO") return "mes";
  if (headerKey === "CHANNEL" || headerKey === "CANAL") return "canal";
  if (headerKey === "PRODUCT" || headerKey === "PRODUCTO") return "producto";
  if (
    headerKey === "METODO" ||
    headerKey === "METODOLOGIA" ||
    headerKey === "METHOD" ||
    headerKey === "METODO_" ||
    headerKey === "TIPO" ||
    headerKey === "TYPE" ||
    headerKey === "TYPO"
  ) {
    return "metodo";
  }
  if (
    headerKey === "BRICK" ||
    headerKey === "CLUE_BRICK" ||
    headerKey === "CLUE__BRICK"
  ) {
    return "brick";
  }
  if (
    headerKey === "CUENTA" ||
    headerKey === "ACCOUNT" ||
    headerKey === "STATE" ||
    headerKey === "ESTADO"
  ) {
    return "cuenta";
  }
  if (
    headerKey === "SALES_CRED" ||
    headerKey === "SALES_CREDIT" ||
    headerKey === "SALES_CREDITY"
  ) {
    return "salesCredity";
  }
  return null;
}

function drillDownColumnPriority(
  field: DrillDownMappingField,
  headerValue: string,
  selectedPeriodMonth?: string | null,
): number {
  const headerKey = normalizeDrillDownHeader(headerValue);

  if (field === "metodo") {
    if (["METODO", "METODOLOGIA", "METHOD", "METODO_"].includes(headerKey)) return 100;
    if (["TIPO", "TYPE", "TYPO"].includes(headerKey)) return 10;
  }

  if (field === "cuenta") {
    if (["CUENTA", "ACCOUNT"].includes(headerKey)) return 100;
    if (["STATE", "ESTADO"].includes(headerKey)) return 10;
  }

  if (field === "cuota") {
    if (["CUOTA", "CUOTA_YTD", "TARGET", "OBJETIVO"].includes(headerKey)) return 100;
    if (selectedMonthHeader(selectedPeriodMonth ?? "") === headerKey) return 50;
  }

  return 50;
}

export function suggestDrillDownColumnMapping(
  headers: string[],
  selectedPeriodMonth?: string | null,
): DrillDownColumnMapping {
  const suggestions: DrillDownColumnMapping = {};

  for (const header of headers) {
    const field = resolveDrillDownColumn(header, selectedPeriodMonth);
    if (!field) continue;

    const currentHeader = suggestions[field];
    if (
      !currentHeader ||
      drillDownColumnPriority(field, header, selectedPeriodMonth) >
        drillDownColumnPriority(field, currentHeader, selectedPeriodMonth)
    ) {
      suggestions[field] = header;
    }
  }

  return suggestions;
}
