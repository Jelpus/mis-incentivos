export type StatusDatabaseError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

export type StatusImportErrorFeedback = {
  message: string;
  issues: string[];
  technicalDetails: string;
};

export type StatusErrorImportRow = {
  id: string;
  row_number: number;
  cleaned_data: Record<string, unknown> | null;
};

export type StatusConflictRecord = {
  id: string;
  nombre_completo?: string | null;
  nombre_manager?: string | null;
  no_empleado?: number | null;
  no_empleado_manager?: number | null;
};

const FIELD_LABELS: Record<string, string> = {
  territorio_individual: "territorio individual",
  territorio_manager: "territorio de manager",
  no_empleado: "número de empleado",
  no_empleado_manager: "número de empleado del manager",
  correo_electronico: "correo electrónico",
  correo_manager: "correo del manager",
  nombre_completo: "nombre completo",
  nombre_manager: "nombre del manager",
  period_month: "período",
  team_id: "equipo",
  base_incentivos: "base de incentivos",
};

export function getStatusUniqueConflict(error: StatusDatabaseError) {
  if (error.code !== "23505" && !error.message?.includes("duplicate key value")) return null;

  // Only use the values reported by PostgreSQL. Do not infer a conflicting person
  // from the constraint name or from another duplicate elsewhere in the file.
  const match = error.details?.match(/Key \(([^)]+)\)=\(([\s\S]*)\) already exists\.?$/);
  if (!match) return null;
  const fields = match[1].split(",").map((field) => field.trim().replace(/^"|"$/g, ""));
  const values = match[2].split(",").map((value) => value.trim());
  if (fields.length !== values.length) return null;

  const conflictFields = fields.filter((field) => field !== "period_month");
  if (conflictFields.length !== 1 || !FIELD_LABELS[conflictFields[0]]) return null;
  const field = conflictFields[0];
  return {
    field,
    value: values[fields.indexOf(field)],
    period: fields.includes("period_month") ? values[fields.indexOf("period_month")] : null,
  };
}

function personLabel(record: Record<string, unknown>): string {
  const name = record.nombre_completo ?? record.nombre_manager;
  const employee = record.no_empleado ?? record.no_empleado_manager;
  const label = name ? String(name) : "Sin nombre";
  return employee ? `${label} (empleado ${employee})` : label;
}

export function formatStatusImportError(
  error: StatusDatabaseError,
  context: {
    batchId?: string;
    periodMonth?: string | null;
    rows?: StatusErrorImportRow[];
    existingRecords?: StatusConflictRecord[];
  } = {},
): StatusImportErrorFeedback {
  const technicalDetails = [
    context.batchId ? `Lote: ${context.batchId}` : null,
    error.code ? `Código: ${error.code}` : null,
    error.message,
    error.details,
    error.hint,
  ].filter(Boolean).join("\n");
  const feedback = (message: string, issues: string[] = []): StatusImportErrorFeedback => ({
    message, issues, technicalDetails,
  });

  if (error.code === "23505" || error.message?.includes("duplicate key value")) {
    const conflict = getStatusUniqueConflict(error);
    if (!conflict) {
      const territory = error.message?.includes("territorio_individual")
        ? "territorio individual (territorio_individual)"
        : error.message?.includes("territorio_manager")
          ? "territorio de manager (territorio_manager)"
          : null;
      return feedback(
        `No se pudo guardar Status porque hay ${territory ? `un ${territory} repetido` : "un valor que debe ser único y está repetido"}. ${territory ? "Revisa ese campo en el Excel y en el Status del período." : "Comparte el detalle técnico con soporte para identificar el campo y los registros."} La base de datos no informó los registros implicados.`,
      );
    }

    const period = conflict.period ?? context.periodMonth;
    const periodLabel = period ? ` para el período ${period.slice(0, 7)}` : "";
    const matchingRows = (context.rows ?? []).filter(
      (row) => String(row.cleaned_data?.[conflict.field] ?? "") === conflict.value,
    );
    const issues = matchingRows.map(
      (row) => `Excel, fila ${row.row_number}: ${personLabel(row.cleaned_data ?? {})}.`,
    );
    issues.push(...(context.existingRecords ?? []).map(
      (record) => `Ya registrado en Status: ${personLabel(record)}.`,
    ));
    return feedback(
      `No se pudo guardar Status: el ${FIELD_LABELS[conflict.field]} (${conflict.field}) «${conflict.value}» está repetido${periodLabel}. Revisa los registros indicados y corrige la asignación o elimina la fila duplicada del Excel. Si es una reasignación, revisa también el registro existente en Status. Después vuelve a cargar el archivo corregido.`,
      issues,
    );
  }

  if (error.code === "23502") {
    const field = error.message?.match(/null value in column "([^"]+)"/)?.[1];
    const label = field ? `${FIELD_LABELS[field] ?? field} (${field})` : "un campo obligatorio";
    return feedback(`No se pudo guardar Status porque falta ${label}. Completa ese dato en el Excel, revisa la asignación de columnas y vuelve a cargar el archivo.`);
  }
  if (error.code === "23503") {
    const reference = error.details?.match(/Key \(([^)]+)\)=\(([^)]+)\) is not present in table "([^"]+)"/);
    if (reference) {
      const [, field, value] = reference;
      return feedback(`No se pudo guardar Status: el valor «${value}» de ${FIELD_LABELS[field] ?? field} (${field}) no existe en el catálogo correspondiente. Corrige ese identificador en el Excel o solicita al administrador que dé de alta el registro; después vuelve a cargar el archivo.`);
    }
    return feedback("No se pudo guardar Status porque un valor hace referencia a un registro que no existe. Revisa los identificadores del archivo y los catálogos correspondientes; comparte el detalle técnico con soporte para localizar el valor rechazado.");
  }
  if (["22P02", "22007", "22008", "23514"].includes(error.code ?? "")) {
    return feedback("No se pudo guardar Status porque hay un dato con formato o valor no permitido. Revisa números, fechas y campos obligatorios del Excel; el detalle técnico indica el dato o la regla rechazada.");
  }
  if (["42501", "PGRST301", "PGRST302", "PGRST303"].includes(error.code ?? "")) {
    return feedback("No tienes acceso para guardar Status o tu sesión venció. Vuelve a iniciar sesión y, si continúa, solicita al administrador que revise tus permisos.");
  }
  if (["57014", "PGRST000", "PGRST001", "PGRST002", "PGRST003"].includes(error.code ?? "")) {
    return feedback("No se pudo completar la operación por un problema de conexión o tiempo de espera. Recarga Status y comprueba si el lote figura como aplicado antes de reintentarlo. Si continúa, comparte el detalle técnico con soporte.");
  }
  return feedback("No se pudo guardar Status. Comparte el detalle técnico con soporte para identificar la causa y la corrección necesaria.");
}
