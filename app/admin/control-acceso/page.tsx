import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { InviteAdminForm } from "@/components/admin/invite-admin-form";
import { AdminRolesPanel } from "@/components/admin/admin-roles-panel";
import { ImpersonationDebugCard } from "@/components/admin/impersonation-debug-card";

export default async function ControlAccesoPage() {
  const { role, impersonation } = await getCurrentAuthContext();
  const currentRole = role === "super_admin" ? "super_admin" : "admin";

  return (
    <section>
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-[#d8e3f8] bg-white p-6 shadow-[0_12px_30px_rgba(0,32,104,0.08)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#445f95]">
          Administracion
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-[#002b7f]">
          Control de acceso
        </h1>
        <p className="mt-3 text-sm text-[#4b5f86]">
          Gestiona invitaciones para administradores de la plataforma.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:p-5">
            <p className="mb-3 text-sm font-semibold text-[#1e3a8a]">Agregar admin</p>
            <InviteAdminForm />
          </div>

          <div className="rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:p-5">
            <p className="mb-3 text-sm font-semibold text-[#1e3a8a]">
              Roles administrativos
            </p>
            <AdminRolesPanel currentRole={currentRole} />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[#e3ebfa] bg-[#f8fbff] p-4 sm:p-5">
          <ImpersonationDebugCard currentImpersonation={impersonation} />
        </div>
      </div>
    </section>
  );
}
