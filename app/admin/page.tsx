import Link from "next/link";

export default function AdminPage() {
  return (
    <section>
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-[#d8e3f8] bg-white p-6 shadow-[0_12px_30px_rgba(0,32,104,0.08)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#445f95]">
          Panel
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-[#002b7f]">
          Admin
        </h1>
        <p className="mt-3 text-sm text-[#4b5f86]">
          Vista base creada. Aqui puedes montar gestion de usuarios, incentivos y
          configuracion global.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/admin/control-acceso"
            className="focus-ring inline-flex items-center rounded-lg border border-[#c8d6f5] bg-[#f2f7ff] px-4 py-2 text-sm font-medium text-[#1d4ed8] transition hover:bg-[#eaf2ff]"
          >
            Ir a Control de acceso
          </Link>
          <Link
            href="/admin/status"
            className="focus-ring inline-flex items-center rounded-lg border border-[#c8d6f5] bg-[#f2f7ff] px-4 py-2 text-sm font-medium text-[#1d4ed8] transition hover:bg-[#eaf2ff]"
          >
            Ir a Sales Force Status
          </Link>
          <Link
            href="/admin/incentive-rules"
            className="focus-ring inline-flex items-center rounded-lg border border-[#c8d6f5] bg-[#f2f7ff] px-4 py-2 text-sm font-medium text-[#1d4ed8] transition hover:bg-[#eaf2ff]"
          >
            Ir a Reglas TeamID
          </Link>
          <Link
            href="/admin/data-sources"
            className="focus-ring inline-flex items-center rounded-lg border border-[#c8d6f5] bg-[#f2f7ff] px-4 py-2 text-sm font-medium text-[#1d4ed8] transition hover:bg-[#eaf2ff]"
          >
            Ir a Data Sources
          </Link>
        </div>
      </div>
    </section>
  );
}
