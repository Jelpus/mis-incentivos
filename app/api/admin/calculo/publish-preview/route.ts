import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePeriodMonthInput } from "@/lib/admin/incentive-rules/shared";
import {
  getPublishPreviewBundle,
  getPublishPreviewHtml,
  type PublishPreviewType,
} from "@/lib/notifications/publish-emails";

export async function GET(request: Request) {
  const { user, role, isActive } = await getCurrentAuthContext();
  if (!user || isActive === false) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Admin client no disponible." }, { status: 500 });
  }

  const searchParams = new URL(request.url).searchParams;
  const periodInput = searchParams.get("periodo");
  const previewTypeInput = String(searchParams.get("tipo") ?? "svm").toLowerCase();
  const recipientKey = searchParams.get("persona");
  const periodMonth = normalizePeriodMonthInput(periodInput);

  if (!periodMonth) {
    return NextResponse.json({ error: "Periodo invalido." }, { status: 400 });
  }

  const previewType: PublishPreviewType = previewTypeInput === "sva" ? "sva" : "svm";

  try {
    const [bundle, html] = await Promise.all([
      getPublishPreviewBundle({ supabase: adminClient, periodMonth }),
      getPublishPreviewHtml({
        supabase: adminClient,
        periodMonth,
        type: previewType,
        key: recipientKey,
      }),
    ]);

    return NextResponse.json({
      periodMonth,
      periodLabel: bundle.periodLabel,
      payPeriodLabel: bundle.payPeriodLabel,
      recipients: {
        svm: bundle.svm,
        sva: bundle.sva,
      },
      selectedType: previewType,
      selectedRecipientKey:
        recipientKey ??
        (previewType === "svm" ? bundle.svm[0]?.key ?? null : bundle.sva[0]?.key ?? null),
      html: html ?? "",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `No se pudo generar preview de correo: ${error.message}`
            : "No se pudo generar preview de correo.",
      },
      { status: 400 },
    );
  }
}
