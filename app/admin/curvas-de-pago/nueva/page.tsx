import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { PayCurveCreateWorkbench } from "@/components/admin/pay-curve-create-workbench";
import { getBaseCurveTemplatePoints } from "@/lib/admin/pay-curves/catalog";

export default async function NuevaCurvaDePagoPage() {
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

  const templatePoints = getBaseCurveTemplatePoints();

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">Admin / Curvas de Pago</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
                Crear curva de pago
              </h1>
              <p className="mt-2 max-w-4xl text-sm text-neutral-600">
                Define una nueva curva con sus puntos de cobertura y factor de pago.
              </p>
            </div>
            <Link
              href="/admin/curvas-de-pago"
              className="inline-flex items-center rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Volver al listado
            </Link>
          </div>
        </header>

        <PayCurveCreateWorkbench initialTemplatePoints={templatePoints} mode="create" />
      </div>
    </main>
  );
}
