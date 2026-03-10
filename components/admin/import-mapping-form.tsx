"use client";

import { resolveImportMappingsAction } from "@/app/admin/status/actions";
import { useActionState } from "react";


type Props = {
  batchId: string;
  importTypeCode: string;
  requiredFields: string[];
  optionalFields: string[];
  detectedHeaders: string[];
  fieldAssignments: Record<string, string | null>;
};

type ActionState =
  | { ok: true; message: string; batchId: string }
  | { ok: false; message: string; batchId?: string }
  | null;

function prettifyFieldName(value: string) {
  return value.replace(/_/g, " ");
}

function requirementLabel(field: string, required: boolean) {
  if (required) return "Requerido";
  if (field === "no_empleado" || field === "correo_electronico") {
    return "Condicional (si no es vacante)";
  }
  return "Opcional";
}

function MappingRow({
  field,
  detectedHeaders,
  assignedHeader,
  required,
}: {
  field: string;
  detectedHeaders: string[];
  assignedHeader: string | null;
  required: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-neutral-200 p-4 md:grid-cols-2">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Campo del sistema
        </p>
        <p className="mt-1 font-medium text-neutral-900">
          {prettifyFieldName(field)}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {requirementLabel(field, required)}
        </p>
      </div>

      <div>
        <label
          htmlFor={`field__${field}`}
          className="text-xs font-medium uppercase tracking-wide text-neutral-500"
        >
          Columna detectada
        </label>

        <select
          id={`field__${field}`}
          name={`field__${field}`}
          required={required}
          defaultValue={assignedHeader ?? ""}
          className="mt-1 w-full rounded-2xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950"
        >
          <option value="">
            {required ? "Selecciona una columna" : "Sin asignar"}
          </option>

          {detectedHeaders.map((header) => (
            <option key={header} value={header}>
              {header}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function ImportMappingForm({
  batchId,
  importTypeCode,
  requiredFields,
  optionalFields,
  detectedHeaders,
  fieldAssignments,
}: Props) {
  const [state, formAction, isPending] =
    useActionState<ActionState, FormData>(resolveImportMappingsAction, null);

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-950">
          Asignar columnas al layout del sistema
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Selecciona qué columna del archivo corresponde a cada campo requerido.
          El sistema recordará estas relaciones para futuras cargas.
        </p>
      </div>

      <form action={formAction} className="space-y-6">
        <input type="hidden" name="batch_id" value={batchId} />
        <input type="hidden" name="import_type_code" value={importTypeCode} />

        <div>
          <h3 className="text-sm font-semibold text-neutral-900">
            Campos requeridos
          </h3>

          <div className="mt-3 space-y-4">
            {requiredFields.map((field) => (
              <MappingRow
                key={field}
                field={field}
                detectedHeaders={detectedHeaders}
                assignedHeader={fieldAssignments[field] ?? null}
                required
              />
            ))}
          </div>
        </div>

        {optionalFields.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">
              Campos opcionales
            </h3>

            <div className="mt-3 space-y-4">
              {optionalFields.map((field) => (
                <MappingRow
                  key={field}
                  field={field}
                  detectedHeaders={detectedHeaders}
                  assignedHeader={fieldAssignments[field] ?? null}
                  required={false}
                />
              ))}
            </div>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Guardando asignaciones..." : "Guardar asignaciones y generar preview"}
        </button>

        {isPending ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Guardando mappings y generando preview del batch. Estamos procesando tus filas.
          </div>
        ) : null}

        {state ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              state.ok
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {state.message}
          </div>
        ) : null}
      </form>
    </div>
  );
}
