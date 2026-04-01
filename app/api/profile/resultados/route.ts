import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getResultadosV2Data } from "@/lib/results/get-resultados-v2-data";

export async function GET(request: Request) {
  const auth = await getCurrentAuthContext();
  const { user, role, isActive, effectiveUserId } = auth;

  if (!user || isActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const periodo = searchParams.get("periodo");
  const maxRowsParam = Number(searchParams.get("maxRows") ?? "");
  const maxRows = Number.isFinite(maxRowsParam) ? Math.max(20, Math.min(500, maxRowsParam)) : undefined;

  const data = await getResultadosV2Data({
    role,
    profileUserId: effectiveUserId ?? user.id,
    periodCode: periodo,
    maxRows,
  });

  return NextResponse.json({ data });
}
