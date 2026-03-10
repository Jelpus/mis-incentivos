// lib/import-engine/header-detector.ts

import { cellToString, isMeaningfulText, normalizeWhitespace } from "./normalizers";
import type { DetectedHeaderResult, ExcelMatrix } from "./types";

function scoreRowForHeader(row: unknown[]): number {
  if (!row || row.length === 0) return 0;

  const values = row.map(cellToString).map(normalizeWhitespace);
  const nonEmpty = values.filter(Boolean);
  const textCells = nonEmpty.filter(isMeaningfulText);

  if (nonEmpty.length === 0) return 0;

  const uniqueCount = new Set(nonEmpty.map((v) => v.toLowerCase())).size;

  let score = 0;
  score += textCells.length * 3;
  score += uniqueCount;
  score -= Math.max(0, nonEmpty.length - textCells.length); // penaliza demasiados números

  return score;
}

export function detectHeaderRow(matrix: ExcelMatrix): DetectedHeaderResult | null {
  if (!matrix.length) return null;

  const candidates = matrix.slice(0, 10);

  let bestIndex = -1;
  let bestScore = -1;

  candidates.forEach((row, index) => {
    const score = scoreRowForHeader(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  if (bestIndex === -1) return null;

  const headers = (matrix[bestIndex] ?? []).map((cell) => normalizeWhitespace(cellToString(cell)));

  return {
    headerRowIndex: bestIndex,
    headerRowNumber: bestIndex + 1,
    headers,
    score: bestScore,
  };
}