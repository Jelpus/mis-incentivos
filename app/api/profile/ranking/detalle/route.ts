import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { getRankingContestData } from "@/lib/ranking-contests/getRankingContestData";

export async function GET(request: NextRequest) {
  const auth = await getCurrentAuthContext();
  if (!auth.user || auth.isActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const contestId = String(request.nextUrl.searchParams.get("contestId") ?? "").trim();
  const participantId = String(request.nextUrl.searchParams.get("participantId") ?? "").trim();
  if (!contestId || !participantId) {
    return NextResponse.json({ error: "Faltan contestId o participantId." }, { status: 400 });
  }

  const data = await getRankingContestData({ contestId, participantId });
  const row = data.rows.find((item) => item.contestId === contestId && item.participantId === participantId) ?? null;

  if (!row) {
    return NextResponse.json({ error: "No se encontro el detalle solicitado.", messages: data.messages }, { status: 404 });
  }

  return NextResponse.json({ row, messages: data.messages });
}
