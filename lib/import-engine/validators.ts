// lib/import-engine/validators.ts

export type ValidationIssue = {
  field: string;
  message: string;
};

export function validateRequiredFields(
  data: Record<string, unknown>,
  requiredFields: readonly string[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const field of requiredFields) {
    const value = data[field];

    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      issues.push({
        field,
        message: `Falta ${field}`,
      });
    }
  }

  return issues;
}

export function validateEmailField(
  data: Record<string, unknown>,
  fieldName: string,
): ValidationIssue[] {
  const value = data[fieldName];
  if (!value) return [];

  const email = String(value).trim();
  const ok = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email);

  return ok
    ? []
    : [{ field: fieldName, message: `${fieldName} inválido` }];
}

export function validatePositiveNumberField(
  data: Record<string, unknown>,
  fieldName: string,
): ValidationIssue[] {
  const value = data[fieldName];
  if (value === null || value === undefined || value === "") return [];

  const num = Number(value);

  if (!Number.isFinite(num) || num < 0) {
    return [{ field: fieldName, message: `${fieldName} inválido` }];
  }

  return [];
}