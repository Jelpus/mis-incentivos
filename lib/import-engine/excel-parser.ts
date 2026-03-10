// lib/import-engine/excel-parser.ts

import * as XLSX from "xlsx";
import type { ExcelMatrix, ParsedWorkbook } from "./types";

function sheetToMatrix(sheet: XLSX.WorkSheet): ExcelMatrix {
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  }) as ExcelMatrix;
}

export function parseExcelBuffer(buffer: Buffer): ParsedWorkbook {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
    raw: false,
  });

  const sheetNames = workbook.SheetNames ?? [];
  const sheets: Record<string, ExcelMatrix> = {};

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    sheets[sheetName] = sheetToMatrix(sheet);
  }

  return {
    sheetNames,
    sheets,
  };
}