import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProfileForm } from "@/components/profile/profile-form";
import { getCurrentAuthContext } from "@/lib/auth/current-user";

export default async function PerfilPage() {
  const supabase = await createClient();
  const adminClient = createAdminClient();
  const { role } = await getCurrentAuthContext();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const profileReader = adminClient ?? supabase;

  const { data: profile } = await profileReader
    .from("profiles")
    .select("email, first_name, last_name, picture_url, global_role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  const initialProfile = {
    email: profile?.email ?? user.email ?? "",
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    pictureUrl: profile?.picture_url ?? "",
    globalRole: profile?.global_role ?? role ?? null,
    isActive: profile?.is_active ?? true,
  };

  return (
    <section>
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-[#d8e3f8] bg-white p-6 shadow-[0_12px_30px_rgba(0,32,104,0.08)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#445f95]">
          Perfil
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-[#002b7f]">
          Mi perfil
        </h1>
        <p className="mt-3 text-sm text-[#4b5f86]">
          Puedes editar tu foto, nombre y apellido. El correo y el rol son solo
          lectura.
        </p>
        <div className="mt-6">
          <ProfileForm initialProfile={initialProfile} />
        </div>
      </div>
    </section>
  );
}
