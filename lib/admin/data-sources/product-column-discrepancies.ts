export type ProductColumnDiscrepancy = {
  rowNumber: number;
  route: string | null;
  producto: string;
  productName: string;
};

export type ProductColumnDiscrepancyAnalysis = {
  count: number;
  examples: ProductColumnDiscrepancy[];
};

const PRODUCT_SCOPE_SUFFIXES = new Set([
  "PRIVATE",
  "PRIV",
  "PRIVADO",
  "PRIVADA",
  "PUBLIC",
  "PUBLICO",
  "PUBLICA",
  "GOV",
  "GOB",
  "GOVERNMENT",
  "OG",
  "IMSS",
  "ISSSTE",
]);

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function buildHeaderMap(row: Record<string, unknown>): Map<string, string> {
  const headers = new Map<string, string>();
  for (const header of Object.keys(row)) {
    const normalized = normalizeHeader(header);
    if (normalized) headers.set(normalized, header);
  }
  return headers;
}

function readValue(
  row: Record<string, unknown>,
  headerMap: Map<string, string>,
  candidates: string[],
): string | null {
  for (const candidate of candidates) {
    const header = headerMap.get(normalizeHeader(candidate));
    if (!header) continue;
    const value = String(row[header] ?? "").trim();
    if (value) return value;
  }
  return null;
}

export function normalizeProductIdentity(value: unknown): string {
  const tokens = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/g)
    .filter(Boolean);

  while (tokens.length > 1 && PRODUCT_SCOPE_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  return tokens.join("");
}

export function analyzeProductColumnDiscrepancies(
  rows: Array<Record<string, unknown>>,
  maxExamples = 10,
): ProductColumnDiscrepancyAnalysis {
  const examples: ProductColumnDiscrepancy[] = [];
  let count = 0;

  rows.forEach((row, index) => {
    const headerMap = buildHeaderMap(row);
    const producto = readValue(row, headerMap, ["producto"]);
    const productName = readValue(row, headerMap, ["product_name", "product name"]);

    // La alerta solo aplica cuando el archivo ofrece ambas columnas para contrastar.
    if (!producto || !productName) return;

    const productoIdentity = normalizeProductIdentity(producto);
    const productNameIdentity = normalizeProductIdentity(productName);
    if (!productoIdentity || !productNameIdentity || productoIdentity === productNameIdentity) return;

    count += 1;
    if (examples.length >= maxExamples) return;

    examples.push({
      rowNumber: index + 2,
      route: readValue(row, headerMap, ["ruta", "territorio_individual", "territorio individual"]),
      producto,
      productName,
    });
  });

  return { count, examples };
}
