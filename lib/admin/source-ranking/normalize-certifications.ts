import { read, utils } from "xlsx";

export type CertificationStatusRow = {
  no_empleado: number | string | null;
  territorio_individual: string | null;
  nombre_completo: string | null;
  is_vacant?: boolean | null;
};

export type CertificationRow = {
  source_row: number;
  source_employee: number | null;
  source_territory: string | null;
  source_name: string;
  matched_employee: number | null;
  matched_territory: string | null;
  matched_name: string | null;
  matched_by: "employee" | "territory" | "unmatched" | "conflict";
  match_issue: string | null;
  scientific_knowledge_pct: number | null;
  annual_certification_pct: number | null;
};

export type CertificationSummary = {
  sourceRows: number;
  matchedRows: number;
  employeeMatches: number;
  territoryMatches: number;
  unmatchedRows: number;
  conflictRows: number;
  missingScoreRows: number;
};

function key(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function territory(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || /^(?:|n\/?a|n\.?d\.?|s\/d|-)$/i.test(String(value).trim());
}

export function parseCertificationPercentage(value: unknown, context: string): number | null {
  if (isMissing(value)) return null;
  const text = String(value).trim();
  const numericText = text.replace(/%$/, "").trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(numericText)) throw new Error(`${context}: porcentaje inválido "${text}".`);
  const numeric = Number(numericText);
  const percentage = text.endsWith("%") ? numeric : numeric <= 1 ? numeric * 100 : numeric;
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) throw new Error(`${context}: el porcentaje debe estar entre 0 y 100.`);
  return Number(percentage.toFixed(6));
}

function employee(value: unknown, context: string): number | null {
  if (isMissing(value)) return null;
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw new Error(`${context}: NO.EMPLEADO inválido.`);
  return numeric;
}

export function normalizeCertifications(params: {
  fileBuffer: Buffer;
  statusRows: CertificationStatusRow[];
}): { rows: CertificationRow[]; summary: CertificationSummary } {
  const workbook = read(params.fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames.find((name) => key(name) === "oficial") ?? workbook.SheetNames[0];
  if (!sheetName) throw new Error("El archivo no tiene hojas.");
  const matrix = utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null, blankrows: true });
  const required = ["noempleado", "territorio", "conocimientocientifico", "acreditacion"];
  const headerIndex = matrix.findIndex((row, index) => index < 30 && required.every((name) => row.some((cell) => key(cell) === name)));
  if (headerIndex < 0) throw new Error("Faltan columnas: NO.EMPLEADO, TERRITORIO, Conocimiento científico y % Acreditación.");
  const headers = matrix[headerIndex].map(key);
  for (const name of required) {
    if (headers.filter((header) => header === name).length !== 1) throw new Error(`La columna ${name} está duplicada.`);
  }
  const value = (row: unknown[], column: string) => row[headers.indexOf(column)];
  const rows: CertificationRow[] = [];
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index];
    if (required.every((column) => isMissing(value(row, column)))) continue;
    const context = `Fila ${index + 1}`;
    rows.push({
      source_row: index + 1,
      source_employee: employee(value(row, "noempleado"), context),
      source_territory: territory(value(row, "territorio")) || null,
      // Sales Rep is the certified person. NAME can describe the new route holder.
      source_name: String(value(row, "salesrep") ?? value(row, "name") ?? "").trim(),
      matched_employee: null, matched_territory: null, matched_name: null,
      matched_by: "unmatched", match_issue: null,
      scientific_knowledge_pct: parseCertificationPercentage(value(row, "conocimientocientifico"), `${context}, Conocimiento científico`),
      annual_certification_pct: parseCertificationPercentage(value(row, "acreditacion"), `${context}, % Acreditación`),
    });
  }
  if (rows.length === 0) throw new Error("El archivo no contiene calificaciones.");
  const employeeCounts = new Map<number, number>();
  const territoryCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.source_employee !== null) employeeCounts.set(row.source_employee, (employeeCounts.get(row.source_employee) ?? 0) + 1);
    if (row.source_territory) territoryCounts.set(row.source_territory, (territoryCounts.get(row.source_territory) ?? 0) + 1);
  }
  const statusByEmployee = new Map<number, CertificationStatusRow[]>();
  const statusByTerritory = new Map<string, CertificationStatusRow[]>();
  for (const row of params.statusRows) {
    if (row.is_vacant) continue;
    const id = employee(row.no_empleado, "Status");
    const route = territory(row.territorio_individual);
    if (id !== null) statusByEmployee.set(id, [...(statusByEmployee.get(id) ?? []), row]);
    if (route) statusByTerritory.set(route, [...(statusByTerritory.get(route) ?? []), row]);
  }
  for (const row of rows) {
    const byEmployee = row.source_employee === null ? [] : statusByEmployee.get(row.source_employee) ?? [];
    const byTerritory = row.source_territory ? statusByTerritory.get(row.source_territory) ?? [] : [];
    if ((row.source_employee !== null && (employeeCounts.get(row.source_employee) ?? 0) > 1) ||
      (row.source_territory && (territoryCounts.get(row.source_territory) ?? 0) > 1)) {
      row.matched_by = "conflict";
      row.match_issue = "Empleado o territorio repetido en el archivo; revisar la identidad antes de evaluar.";
      continue;
    }
    if (byEmployee.length > 1 || byTerritory.length > 1 ||
      (byEmployee.length === 1 && byTerritory.length === 1 && Number(byEmployee[0].no_empleado) !== Number(byTerritory[0].no_empleado))) {
      row.matched_by = "conflict";
      row.match_issue = "NO.EMPLEADO y TERRITORIO no identifican una única persona en Status.";
      continue;
    }
    // A supplied employee ID is authoritative. Never assign another employee
    // merely because they now occupy the same territory.
    const match = row.source_employee !== null ? byEmployee[0] : byTerritory[0];
    if (!match) {
      row.match_issue = row.source_employee !== null ? "NO.EMPLEADO no encontrado en el Status del año." : "Territorio sin una persona activa en Status.";
      continue;
    }
    row.matched_by = row.source_employee !== null ? "employee" : "territory";
    row.matched_employee = employee(match.no_empleado, "Status");
    row.matched_territory = territory(match.territorio_individual) || null;
    row.matched_name = match.nombre_completo;
    if (row.source_territory && row.source_territory !== row.matched_territory) row.match_issue = "Vinculado por empleado; el territorio original difiere del Status seleccionado.";
  }
  return {
    rows,
    summary: {
      sourceRows: rows.length,
      matchedRows: rows.filter((r) => r.matched_by === "employee" || r.matched_by === "territory").length,
      employeeMatches: rows.filter((r) => r.matched_by === "employee").length,
      territoryMatches: rows.filter((r) => r.matched_by === "territory").length,
      unmatchedRows: rows.filter((r) => r.matched_by === "unmatched").length,
      conflictRows: rows.filter((r) => r.matched_by === "conflict").length,
      missingScoreRows: rows.filter((r) => r.scientific_knowledge_pct === null || r.annual_certification_pct === null).length,
    },
  };
}
