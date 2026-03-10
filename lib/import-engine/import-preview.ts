import { parseExcelBuffer } from "./excel-parser";
import { detectHeaderRow } from "./header-detector";
import type { SheetPreview, WorkbookPreview } from "./types";

function scoreSheetPreview(preview: SheetPreview): number {
  if (!preview.detectedHeader) return 0;

  let score = 0;

  score += preview.detectedHeader.headers.filter(Boolean).length * 2;
  score += Math.min(preview.totalRows, 50);

  const normalizedName = preview.sheetName.toLowerCase();

  if (
    normalizedName.includes("base") ||
    normalizedName.includes("crm") ||
    normalizedName.includes("status") ||
    normalizedName.includes("fuerza") ||
    normalizedName.includes("ventas") ||
    normalizedName.includes("layout")
  ) {
    score += 10;
  }

  return score;
}

export function previewExcelImport(buffer: Buffer): WorkbookPreview {
  const parsed = parseExcelBuffer(buffer);

  const previews: SheetPreview[] = parsed.sheetNames.map((sheetName) => {
    const matrix = parsed.sheets[sheetName] ?? [];
    const detectedHeader = detectHeaderRow(matrix);
    const sampleRows = matrix.slice(0, 8);

    return {
      sheetName,
      totalRows: matrix.length,
      detectedHeader,
      sampleRows,
    };
  });

  const sorted = [...previews].sort(
    (a, b) => scoreSheetPreview(b) - scoreSheetPreview(a),
  );

  const suggestedSheetName = sorted[0]?.sheetName ?? null;

  return {
    sheetNames: parsed.sheetNames,
    previews,
    suggestedSheetName,
  };
}