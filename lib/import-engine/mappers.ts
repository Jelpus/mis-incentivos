// lib/import-engine/mappers.ts

export function mapRawRowToTargetFields(
  rawData: Record<string, unknown>,
  mappingSnapshot: Record<string, string | null>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  for (const [rawHeader, value] of Object.entries(rawData)) {
    const targetField = mappingSnapshot[rawHeader];

    if (!targetField) continue;
    mapped[targetField] = value;
  }

  return mapped;
}