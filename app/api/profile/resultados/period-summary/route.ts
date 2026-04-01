import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getResultadosV2PeriodSummary } from "@/lib/results/get-resultados-v2-data";

export async function GET(request: Request) {
  const auth = await getCurrentAuthContext();
  const { user, role, isActive, effectiveUserId } = auth;

  if (!user || isActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const maxPeriodsParam = Number(searchParams.get("maxPeriods") ?? "");
  const maxPeriods = Number.isFinite(maxPeriodsParam)
    ? Math.max(3, Math.min(24, maxPeriodsParam))
    : undefined;

  const data = await getResultadosV2PeriodSummary({
    role,
    profileUserId: effectiveUserId ?? user.id,
    maxPeriods,
  });

  return NextResponse.json({ data });
}
