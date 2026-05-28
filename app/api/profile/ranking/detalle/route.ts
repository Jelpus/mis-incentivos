import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getRankingContestData } from "@/lib/ranking-contests/getRankingContestData";
import { createAdminClient } from "@/lib/supabase/admin";

async function resolveParticipantPeriodMonth(participantId: string) {
  const supabase = createAdminClient();
  if (!supabase) return null;

  const statusResult = await supabase
    .from("sales_force_status")
    .select("period_month")
    .eq("id", participantId)
    .maybeSingle<{ period_month: string | null }>();

  const statusPeriod = String(statusResult.data?.period_month ?? "").trim();
  if (statusPeriod) return statusPeriod;

  const managerResult = await supabase
    .from("manager_status")
    .select("period_month")
    .eq("id", participantId)
    .maybeSingle<{ period_month: string | null }>();

  return String(managerResult.data?.period_month ?? "").trim() || null;
}

export async function GET(request: NextRequest) {
  const auth = await getCurrentAuthContext();
  if (!auth.user || auth.isActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const contestId = String(request.nextUrl.searchParams.get("contestId") ?? "").trim();
  const participantId = String(request.nextUrl.searchParams.get("participantId") ?? "").trim();
  const requestedPeriodMonth = String(request.nextUrl.searchParams.get("period") ?? "").trim() || null;
  if (!contestId || !participantId) {
    return NextResponse.json({ error: "Faltan contestId o participantId." }, { status: 400 });
  }

  const periodMonth = requestedPeriodMonth ?? await resolveParticipantPeriodMonth(participantId);
  const data = await getRankingContestData({ contestId, participantId, maxCoveragePeriodMonth: periodMonth });
  const row = data.rows.find((item) => item.contestId === contestId && item.participantId === participantId) ?? null;

  if (!row) {
    return NextResponse.json({ error: "No se encontro el detalle solicitado.", messages: data.messages }, { status: 404 });
  }

  return NextResponse.json({ row, messages: data.messages });
}
