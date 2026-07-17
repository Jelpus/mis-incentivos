import { PlatformChangeLogCard } from "@/components/admin/platform-change-log-card";
import { getPlatformChangeLogPageData } from "@/lib/admin/platform/get-platform-page-data";

export default async function AdminPlatformChangesControlPage() {
  const changeLog = await getPlatformChangeLogPageData();

  return (
    <>
      <section className="rounded-2xl border border-[#dbe5f8] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#0f172a]">Control de cambios</h2>
        <p className="mt-1 max-w-4xl text-sm text-neutral-600">
          Registro funcional por fecha, ruta, estado anterior, estado modificado y commit asociado.
        </p>
      </section>

      <PlatformChangeLogCard changeLog={changeLog} />
    </>
  );
}
