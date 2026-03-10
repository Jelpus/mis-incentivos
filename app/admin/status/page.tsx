import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getStatusPageData } from "@/lib/admin/status/get-status-page-data";
import { ClonePeriodCard } from "@/components/admin/clone-period-card";
import { MassImportUploadCard } from "@/components/admin/mass-import-upload-card";
import { ManagerStatusCurrentTable } from "@/components/admin/manager-status-current-table";
import { StatusPeriodPicker } from "@/components/admin/status-period-picker";
import { StatusCurrentTable } from "@/components/admin/status-current-table";

type AdminRole = "admin" | "super_admin";

function formatPeriodLabel(value: string) {
  const [year, month] = value.split("-");
  return `${month}/${year}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

  const managerTotal = managers.length;
  const managerActive = managers.filter((row) => row.is_active).length;
  const managerInactive = Math.max(managerTotal - managerActive, 0);
  const managerVacant = managers.filter((row) => row.is_vacant).length;

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
                cambios detectados, cargas masivas y mantén trazabilidad completa
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
              Período seleccionado: {formatPeriodLabel(periodMonth)}
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">Último batch</p>

            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {latestBatch?.status ?? "—"}
            </p>

            <p className="mt-1 text-xs text-neutral-500">
              {latestBatch?.created_at
                ? `Procesado: ${formatDateTime(latestBatch.created_at)}`
                : "Sin cargas registradas todavía"}
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
              Puedes actualizar el status con clonación mensual o carga masiva con flujo SVA/SVM.
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
            Consulta históricos, lotes procesados y logs de auditoría.
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
                Auditoría avanzada
              </Link>
            ) : null}
          </div>
        </section>

        {/* TABLE */}

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">

            <div>
              <h2 className="text-lg font-semibold text-neutral-950">
                Status actual
              </h2>

              <p className="mt-1 text-sm text-neutral-600">
                Catálogos vigentes para managers (SVM) y representantes (SVA).
              </p>
            </div>

            <StatusPeriodPicker value={periodMonth.slice(0, 7)} />

          </div>

          <div className="mt-6">
            <h3 className="text-base font-semibold text-neutral-900">
              Managers (SVM)
            </h3>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700">
                Total: {managerTotal}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                Activos: {managerActive}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700">
                Inactivos: {managerInactive}
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                Vacantes: {managerVacant}
              </span>
            </div>
          </div>

          <ManagerStatusCurrentTable rows={managers} periodMonth={periodMonth} />

          <div className="mt-8">
            <h3 className="text-base font-semibold text-neutral-900">
              Representantes (SVA)
            </h3>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700">
                Total: {totalRows}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                Activos: {activeRows}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700">
                Inactivos: {inactiveRows}
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                Vacantes: {vacantRows}
              </span>
              {latestAvailablePeriodMonth ? (
                <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                  Último período disponible: {formatPeriodLabel(latestAvailablePeriodMonth)}
                </span>
              ) : null}
            </div>
          </div>

          <StatusCurrentTable rows={rows} periodMonth={periodMonth} />

        </section>

      </div>
    </main>
  );
}
