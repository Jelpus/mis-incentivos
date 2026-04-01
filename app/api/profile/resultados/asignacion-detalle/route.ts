import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getAsignacionUnidadesDetail } from "@/lib/results/get-asignacion-unidades-detail";

export async function GET(request: Request) {
  const auth = await getCurrentAuthContext();
  const { user, role, isActive, effectiveUserId } = auth;

  if (!user || isActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const periodo = String(searchParams.get("periodo") ?? "").trim();
  const ruta = String(searchParams.get("ruta") ?? "").trim();
  const plan = String(searchParams.get("plan") ?? "").trim();
  const teamId = String(searchParams.get("teamId") ?? "").trim() || null;

  if (!periodo || !ruta || !plan) {
    return NextResponse.json(
      { error: "Faltan parametros requeridos: periodo, ruta, plan." },
      { status: 400 },
    );
  }

  const result = await getAsignacionUnidadesDetail({
    role,
    profileUserId: effectiveUserId ?? user.id,
    periodo,
    ruta,
    plan,
    teamId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message ?? "No se pudo cargar el detalle." }, { status: 400 });
  }

  return NextResponse.json({ rows: result.rows, message: result.message });
}
