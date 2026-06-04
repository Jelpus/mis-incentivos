import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { traceCalculation } from "@/lib/admin/calculation-debugger/trace-calculation";
import { createAdminClient } from "@/lib/supabase/admin";

type Payload = {
  period?: string;
  representativeName?: string;
  product?: string;
  metric?: string;
  expectedValue?: number | string;
  actualValue?: number | string;
  description?: string;
};

function toNumber(value: unknown): number {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildTitle(payload: Required<Pick<Payload, "period" | "representativeName" | "product">>): string {
  return [
    "Calculation Debugger",
    payload.period,
    payload.representativeName,
    payload.product,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" / ");
}

export async function POST(request: Request) {
  const { user, role, isActive, effectiveEmail } = await getCurrentAuthContext();

  if (!user || isActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "No tienes permisos para investigar calculos." }, { status: 403 });
  }

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "No se pudo leer la solicitud." }, { status: 400 });
  }

  const period = String(payload.period ?? "").trim();
  const representativeName = String(payload.representativeName ?? "").trim();
  const product = String(payload.product ?? "").trim();
  const metric = String(payload.metric ?? "").trim() || "resultado";
  const description = String(payload.description ?? "").trim();
  const expectedValue = toNumber(payload.expectedValue);
  const actualValue = toNumber(payload.actualValue);
  const difference = actualValue - expectedValue;

  if (!period || !representativeName || !product || !description) {
    return NextResponse.json(
      { error: "Faltan campos requeridos: period, representativeName, product y description." },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 500 },
    );
  }

  const title = buildTitle({ period, representativeName, product });

  const reportResult = await adminClient
    .from("admin_bug_reports")
    .insert({
      title,
      description,
      period,
      representative_name: representativeName,
      product,
      metric,
      expected_value: expectedValue,
      actual_value: actualValue,
      difference,
      status: "open",
      priority: Math.abs(difference) > 0 ? "normal" : "low",
      created_by: user.id,
      created_by_email: effectiveEmail ?? user.email ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (reportResult.error || !reportResult.data?.id) {
    return NextResponse.json(
      {
        error:
          reportResult.error?.message ??
          "No se pudo guardar el reporte. Verifica que existan admin_bug_reports y admin_bug_diagnoses.",
      },
      { status: 400 },
    );
  }

  try {
    const diagnosis = await traceCalculation({
      period,
      representativeName,
      product,
      metric,
      expectedValue,
      actualValue,
      description,
    });

    const diagnosisResult = await adminClient
      .from("admin_bug_diagnoses")
      .insert({
        bug_report_id: reportResult.data.id,
        diagnosis_summary: diagnosis.diagnosisSummary,
        suspected_cause: diagnosis.suspectedCause,
        recommended_fix: diagnosis.recommendedFix,
        confidence_score: diagnosis.confidenceScore,
        trace_data: diagnosis.traceData,
        ai_response: null,
      })
      .select("id")
      .single<{ id: string }>();

    if (diagnosisResult.error) {
      return NextResponse.json(
        {
          error: `Reporte guardado, pero no se pudo guardar el diagnostico: ${diagnosisResult.error.message}`,
          bugReportId: reportResult.data.id,
          diagnosis,
        },
        { status: 207 },
      );
    }

    return NextResponse.json({
      bugReportId: reportResult.data.id,
      diagnosisId: diagnosisResult.data?.id ?? null,
      diagnosis,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo ejecutar el trace.";
    await adminClient
      .from("admin_bug_reports")
      .update({ status: "needs_review", updated_at: new Date().toISOString() })
      .eq("id", reportResult.data.id);

    return NextResponse.json(
      {
        error: message,
        bugReportId: reportResult.data.id,
      },
      { status: 500 },
    );
  }
}
