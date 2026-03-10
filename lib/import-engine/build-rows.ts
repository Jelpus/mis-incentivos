// lib/import-engine/build-rows.ts

import { cellToString, normalizeWhitespace } from "./normalizers";
import type { ExcelMatrix } from "./types";

export type BuiltImportRow = {
  rowNumber: number;
  rawData: Record<string, string>;
};

function getHeaders(matrix: ExcelMatrix, headerRowIndex: number): string[] {
  const headerRow = matrix[headerRowIndex] ?? [];
  return headerRow.map((cell) => normalizeWhitespace(cellToString(cell)));
}

export function buildRowsFromSheet(
  matrix: ExcelMatrix,
  headerRowIndex: number,
): BuiltImportRow[] {
  const headers = getHeaders(matrix, headerRowIndex);
  const rows: BuiltImportRow[] = [];

  for (let i = headerRowIndex + 1; i < matrix.length; i += 1) {
    const row = matrix[i] ?? [];
    const rawData: Record<string, string> = {};

    let hasSomeValue = false;

    headers.forEach((header, colIndex) => {
      if (!header) return;

      const value = normalizeWhitespace(cellToString(row[colIndex]));
      rawData[header] = value;

      if (value) {
        hasSomeValue = true;
      }
    });

    if (!hasSomeValue) continue;

    rows.push({
      rowNumber: i + 1, // Excel-style row number
      rawData,
    });
  }

  return rows;
}