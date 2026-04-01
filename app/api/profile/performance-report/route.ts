import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getPerformanceReportData } from "@/lib/performance/get-performance-report-data";

function parsePeriodCodesParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^\d{6}$/.test(item));
}

export async function GET(request: Request) {
  const auth = await getCurrentAuthContext();
  const { user, isActive, role, actorRole } = auth;

  if (!user || isActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const hasAdminAccess =
    role === "admin" || role === "super_admin" || actorRole === "admin" || actorRole === "super_admin";
  if (!hasAdminAccess) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const periodCodes = parsePeriodCodesParam(searchParams.get("periodos"));

  const data = await getPerformanceReportData({
    periodCodes,
    filters: {
      teamId: searchParams.get("teamId"),
      linea: searchParams.get("linea"),
      productName: searchParams.get("productName"),
      manager: searchParams.get("manager"),
    },
  });

  return NextResponse.json({ data });
}
