// lib/import-engine/column-mapper.ts

import { normalizeHeaderText } from "./normalizers";

export type KnownMapping = {
  excel_header: string;
  normalized_header: string;
  target_field: string;
};

export type HeaderMappingResult = {
  originalHeader: string;
  normalizedHeader: string;
  targetField: string | null;
  isMapped: boolean;
  matchSource: "learned" | "direct_field" | "alias" | "unmapped";
};

const FIELD_ALIASES: Record<string, string[]> = {
  linea_principal: ["linea_principal", "linea", "linea principal"],
  parrilla: ["parrilla"],
  nombre_completo: [
    "nombre_completo",
    "nombre completo",
    "nombre del representante",
    "representante",
    "rep_name",
    "nombre",
  ],
  no_empleado: [
    "no_empleado",
    "numero_empleado",
    "n_empleado",
    "id_empleado",
    "empleado_id",
    "employee_id",
  ],
  territorio_padre: [
    "territorio_padre",
    "ruta_manager",
    "territorio manager",
  ],
  territorio_individual: [
    "territorio_individual",
    "ruta",
    "territorio",
    "territorio individual",
  ],
  puesto: ["puesto", "cargo", "position"],
  correo_electronico: [
    "correo_electronico",
    "correo",
    "mail",
    "email",
    "correo electronico",
  ],
  ciudad: [
    "ciudad",
    "city",
    "maps",
    "mapa",
    "google maps",
    "ubicacion",
    "location",
  ],
  fecha_ingreso: ["fecha_ingreso", "fecha ingreso", "ingreso", "fecha_alta"],
  team_id: ["team_id", "team", "equipo", "crm_team", "id_team"],
  base_incentivos: [
    "base_incentivos",
    "base incentivos",
    "incentivo_base",
    "base",
  ],
  is_vacant: ["is_vacant", "vacante", "vacancy", "posicion_vacante", "posición vacante"],
  territorio_manager: ["territorio_manager", "territorio manager", "manager_territory", "ruta_manager"],
  nombre_manager: ["nombre_manager", "manager_name", "nombre manager"],
  correo_manager: ["correo_manager", "email_manager", "mail_manager", "correo manager"],
  no_empleado_manager: ["no_empleado_manager", "employee_id_manager", "id_manager"],
};

function buildAliasMap(validTargetFields: string[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const field of validTargetFields) {
    const aliases = FIELD_ALIASES[field] ?? [field];

    // siempre añadimos también el propio nombre del campo
    const allAliases = new Set([field, ...aliases]);

    for (const alias of allAliases) {
      const normalizedAlias = normalizeHeaderText(alias);
      if (!normalizedAlias) continue;

      if (!map.has(normalizedAlias)) {
        map.set(normalizedAlias, field);
      }
    }
  }

  return map;
}

export function resolveHeaderMappings(
  headers: string[],
  knownMappings: KnownMapping[],
  validTargetFields: string[],
): {
  mapped: HeaderMappingResult[];
  unmapped: HeaderMappingResult[];
} {
  const validFieldSet = new Set(validTargetFields);

  const mappingByNormalizedHeader = new Map<string, string>();
  for (const mapping of knownMappings) {
    if (!validFieldSet.has(mapping.target_field)) continue;
    mappingByNormalizedHeader.set(mapping.normalized_header, mapping.target_field);
  }

  const aliasMap = buildAliasMap(validTargetFields);

  const mappedResults: HeaderMappingResult[] = headers.map((header) => {
    const normalizedHeader = normalizeHeaderText(header);

    // 1) match aprendido
    const learnedMatch =
      normalizedHeader ? mappingByNormalizedHeader.get(normalizedHeader) : null;

    if (learnedMatch) {
      return {
        originalHeader: header,
        normalizedHeader,
        targetField: learnedMatch,
        isMapped: true,
        matchSource: "learned",
      };
    }

    // 2) match directo con el nombre del campo
    if (normalizedHeader && validFieldSet.has(normalizedHeader)) {
      return {
        originalHeader: header,
        normalizedHeader,
        targetField: normalizedHeader,
        isMapped: true,
        matchSource: "direct_field",
      };
    }

    // 3) match por alias
    const aliasMatch = normalizedHeader ? aliasMap.get(normalizedHeader) : null;

    if (aliasMatch && validFieldSet.has(aliasMatch)) {
      return {
        originalHeader: header,
        normalizedHeader,
        targetField: aliasMatch,
        isMapped: true,
        matchSource: "alias",
      };
    }

    // 4) no match
    return {
      originalHeader: header,
      normalizedHeader,
      targetField: null,
      isMapped: false,
      matchSource: "unmapped",
    };
  });

  return {
    mapped: mappedResults.filter((item) => item.isMapped),
    unmapped: mappedResults.filter((item) => !item.isMapped),
  };
}
