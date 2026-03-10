import { cleanBooleanLike, cleanEmail, cleanInteger, cleanText } from "./cleaners";

export const MANAGER_REQUIRED_FIELDS = [
  "territorio_manager",
  "nombre_manager",
] as const;

export const MANAGER_OPTIONAL_IMPORT_FIELDS = [
  "correo_manager",
  "no_empleado_manager",
  "is_active",
  "is_vacant",
] as const;

export type ManagerField =
  | (typeof MANAGER_REQUIRED_FIELDS)[number]
  | (typeof MANAGER_OPTIONAL_IMPORT_FIELDS)[number];

export const MANAGER_FIELD_CLEANERS: Record<string, (value: unknown) => unknown> = {
  territorio_manager: cleanText,
  nombre_manager: cleanText,
  correo_manager: cleanEmail,
  no_empleado_manager: cleanInteger,
  is_active: cleanBooleanLike,
  is_vacant: cleanBooleanLike,
};
