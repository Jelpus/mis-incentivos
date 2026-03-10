// lib/import-engine/types.ts

export type ExcelCellValue = string | number | boolean | null | undefined;

export type ExcelMatrix = ExcelCellValue[][];

export type ParsedWorkbook = {
  sheetNames: string[];
  sheets: Record<string, ExcelMatrix>;
};

export type DetectedHeaderResult = {
  headerRowIndex: number; // 0-based
  headerRowNumber: number; // 1-based
  headers: string[];
  score: number;
};

export type SheetPreview = {
  sheetName: string;
  totalRows: number;
  detectedHeader: DetectedHeaderResult | null;
  sampleRows: ExcelMatrix;
};

export type WorkbookPreview = {
  sheetNames: string[];
  previews: SheetPreview[];
  suggestedSheetName: string | null;
};