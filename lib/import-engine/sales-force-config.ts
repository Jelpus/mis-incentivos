import {
  cleanEmail,
  cleanInteger,
  cleanNumber,
  cleanPersonName,
  cleanText,
  tryParseFlexibleDate,
  cleanBooleanLike
} from "./cleaners";

export const SALES_FORCE_REQUIRED_FIELDS = [
  "linea_principal",
  "parrilla",
  "nombre_completo",
  "territorio_padre",
  "territorio_individual",
  "puesto",
  "team_id",
  "base_incentivos",
] as const;

export const SALES_FORCE_OPTIONAL_IMPORT_FIELDS = [
  "no_empleado",
  "correo_electronico",
  "is_vacant",
  "ciudad",
  "fecha_ingreso",
  "valid_since_period",
] as const;

export type SalesForceField =
  | (typeof SALES_FORCE_REQUIRED_FIELDS)[number]
  | (typeof SALES_FORCE_OPTIONAL_IMPORT_FIELDS)[number];

export const SALES_FORCE_FIELD_CLEANERS: Record<string, (value: unknown) => unknown> = {
  linea_principal: cleanText,
  parrilla: cleanText,
  nombre_completo: cleanPersonName,
  no_empleado: cleanInteger,
  territorio_padre: cleanText,
  territorio_individual: cleanText,
  puesto: cleanText,
  correo_electronico: cleanEmail,
  ciudad: cleanText,
  fecha_ingreso: tryParseFlexibleDate,
  valid_since_period: tryParseFlexibleDate,
  team_id: cleanText,
  base_incentivos: cleanNumber,
  is_vacant: cleanBooleanLike,
};
