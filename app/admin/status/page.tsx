import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getStatusPageData } from "@/lib/admin/status/get-status-page-data";
import { ClonePeriodCard } from "@/components/admin/clone-period-card";
import { MassImportUploadCard } from "@/components/admin/mass-import-upload-card";
import { StatusCurrentCollapsible } from "@/components/admin/status-current-collapsible";
import { formatDateTimeNoTimezoneShift } from "@/lib/date-time";

type AdminRole = "admin" | "super_admin";

function formatPeriodLabel(value: string) {
  const [year, month] = value.split("-");
  return `${month}/${year}`;
}

function formatDateTime(value: string | null) {
  return formatDateTimeNoTimezoneShift(value, "es-MX", "-");
}

type PageProps = {
  searchParams?: Promise<{
    period?: string;
  }>;
};

export default async function StatusPage({ searchParams }: PageProps) {
  const { user, role, isActive } = await getCurrentAuthContext();

  if (!user) {
    redirect("/login");
  }

  if (isActive === false) {
    redirect("/inactive");
  }

  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin" || isSuperAdmin;

  if (!isAdmin) {
    redirect("/");
  }

  const currentRole: AdminRole = isSuperAdmin ? "super_admin" : "admin";

  const params = searchParams ? await searchParams : {};
  const selectedPeriodInput = params?.period ?? null;

  const {
    rows,
    managers,
    totalRows,
    periodMonth,
    latestAvailablePeriodMonth,
    activeRows,
    inactiveRows,
    vacantRows,
    latestBatch,
    cloneContext,
  } = await getStatusPageData(selectedPeriodInput);


  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">

        {/* HEADER */}

        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

            <div className="space-y-2">
              <p className="text-sm font-medium text-neutral-500">
                Admin / Status
              </p>

              <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">
                Fuerza de ventas
              </h1>

              <p className="max-w-3xl text-sm text-neutral-600">
                Gestiona la estructura mensual de fuerza de ventas, revisa
                cambios detectados, cargas masivas y manten trazabilidad completa
                de movimientos y versiones.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">

              <span className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                Rol: {currentRole}
              </span>

              <span className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                {user.email}
              </span>

            </div>
          </div>
        </header>

        {/* KPI */}

        <section className="grid gap-4 md:grid-cols-2">

          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">Registros vigentes</p>

            <p className="mt-2 text-3xl font-semibold text-neutral-950">
              {totalRows}
            </p>

            <p className="mt-1 text-xs text-neutral-500">
              Periodo seleccionado: {formatPeriodLabel(periodMonth)}
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">Ultimo batch</p>

            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {latestBatch?.status ?? "-"}
            </p>

            <p className="mt-1 text-xs text-neutral-500">
              {latestBatch?.created_at
                ? `Procesado: ${formatDateTime(latestBatch.created_at)}`
                : "Sin cargas registradas todavia"}
            </p>
          </div>

        </section>

        {/* UPDATE ACTIONS */}

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-neutral-950">
              Actualizar status
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Puedes actualizar el status con clonacion mensual o carga masiva con flujo SVA/SVM.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ClonePeriodCard cloneContext={cloneContext} />
            <MassImportUploadCard defaultPeriodMonth={periodMonth.slice(0, 7)} />
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Trazabilidad</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Consulta historicos, lotes procesados y logs de auditoria.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/admin/status/history"
              className="inline-flex items-center justify-center rounded-2xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Ver historial
            </Link>
            {isSuperAdmin ? (
              <Link
                href={latestBatch ? `/admin/status/history/${latestBatch.id}` : "/admin/status/history"}
                className="inline-flex items-center justify-center rounded-2xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Auditoria avanzada
              </Link>
            ) : null}
          </div>
        </section>

        {/* TABLE */}
        <StatusCurrentCollapsible
          rows={rows}
          managers={managers}
          periodMonth={periodMonth}
          latestAvailablePeriodMonth={latestAvailablePeriodMonth}
          totalRows={totalRows}
          activeRows={activeRows}
          inactiveRows={inactiveRows}
          vacantRows={vacantRows}
        />

      </div>
    </main>
  );
}
