import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { PayCurveCreateWorkbench } from "@/components/admin/pay-curve-create-workbench";
import { getPayCurveDetailData } from "@/lib/admin/pay-curves/get-pay-curves-data";

type PageProps = {
  params: Promise<{
    curveId: string;
  }>;
};

export default async function EditarCurvaDePagoPage({ params }: PageProps) {
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

  const routeParams = await params;
  const curveId = String(routeParams.curveId ?? "").trim();
  if (!curveId) notFound();

  const detailData = await getPayCurveDetailData(curveId);
  if (!detailData.ok) {
    return (
      <main className="min-h-screen bg-neutral-50">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-amber-900">No se pudo cargar la curva</h1>
            <p className="mt-2 text-sm text-amber-800">{detailData.message}</p>
            <Link
              href="/admin/curvas-de-pago"
              className="mt-4 inline-flex items-center rounded-xl border border-amber-400 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Volver al listado
            </Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">Admin / Curvas de Pago</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
                Editar curva de pago
              </h1>
              <p className="mt-2 max-w-4xl text-sm text-neutral-600">
                Modifica metadata y puntos de la curva seleccionada.
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

        <PayCurveCreateWorkbench
          mode="edit"
          curveId={detailData.row.id}
          initialName={detailData.row.name}
          initialDescription={detailData.row.description}
          initialTemplatePoints={detailData.row.points}
        />
      </div>
    </main>
  );
}
