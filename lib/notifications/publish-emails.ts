import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/auth/email-domain";

export type ManagerPublishRow = {
  period_month: string;
  correo_manager: string | null;
  nombre_manager: string | null;
  team_id: string | null;
  territorio_manager: string | null;
  no_empleado_manager: number | null;
  is_active: boolean | null;
};

export type SalesForcePublishRow = {
  period_month: string;
  correo_electronico: string | null;
  nombre_completo: string | null;
  team_id: string | null;
  territorio_individual: string | null;
  no_empleado: number | null;
  is_active: boolean | null;
};

type SendEmailResult = {
  ok: boolean;
  error?: string;
};

export type PublishPreviewRecipient = {
  key: string;
  email: string;
  displayName: string;
  teamId: string;
  territorio: string;
  empleado: string;
  estado: "activo" | "inactivo";
};

export type PublishPreviewType = "svm" | "sva";

export type PublishPreviewBundle = {
  periodMonth: string;
  periodLabel: string;
  payPeriodLabel: string;
  svm: PublishPreviewRecipient[];
  sva: PublishPreviewRecipient[];
};

export type PublishEmailsSummary = {
  managers: { attempted: number; sent: number; failed: number };
  salesForce: { attempted: number; sent: number; failed: number };
  failures: string[];
};

type SendPublishEmailsParams = {
  supabase: SupabaseClient;
  periodMonth: string;
};

function getBaseUrl() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    "http://localhost:3000";
  return siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
}

function periodDateFromMonth(periodMonth: string) {
  const year = Number(periodMonth.slice(0, 4));
  const month = Number(periodMonth.slice(5, 7));
  return new Date(Date.UTC(year, month - 1, 1));
}

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function formatPeriodLong(periodMonth: string) {
  const date = periodDateFromMonth(periodMonth);
  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function escapeHtml(value: unknown): string {
  const raw = String(value ?? "");
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTemplate(template: string, values: Record<string, string>) {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  return rendered;
}

function buildSubject(periodMonth: string) {
  return `Mis Incentivos 2.0 | Resultados publicados (${periodMonth.slice(0, 7)})`;
}

async function loadTemplate(templateName: "managers_publish.html" | "sales_force_publish.html") {
  const fullPath = path.join(process.cwd(), "templates", "emails", templateName);
  return readFile(fullPath, "utf8");
}

async function sendEmailWithSendGrid(params: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}): Promise<SendEmailResult> {
  const sendgridApiKey = process.env.SENDGRID_API_KEY?.trim();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim() || process.env.PUBLISH_EMAIL_FROM?.trim() || "";
  const fromName = process.env.SENDGRID_FROM_NAME?.trim() || "Mis Incentivos 2.0";

  if (!sendgridApiKey) {
    return { ok: false, error: "Falta SENDGRID_API_KEY." };
  }
  if (!fromEmail) {
    return { ok: false, error: "Falta PUBLISH_EMAIL_FROM o SENDGRID_FROM_EMAIL." };
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      "Content-Type": "application/json",
      ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: { email: fromEmail, name: fromName },
      personalizations: [{ to: [{ email: params.to }] }],
      subject: params.subject,
      content: [{ type: "text/html", value: params.html }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `SendGrid ${response.status}: ${text}` };
  }

  return { ok: true };
}

function dedupeManagers(rows: ManagerPublishRow[]) {
  const unique = new Map<string, ManagerPublishRow>();
  for (const row of rows) {
    const email = normalizeEmail(String(row.correo_manager ?? ""));
    if (!email || !email.includes("@")) continue;
    const key = `${email}|${String(row.team_id ?? "").trim()}|${String(row.territorio_manager ?? "").trim()}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  return Array.from(unique.values());
}

function dedupeSales(rows: SalesForcePublishRow[]) {
  const unique = new Map<string, SalesForcePublishRow>();
  for (const row of rows) {
    const email = normalizeEmail(String(row.correo_electronico ?? ""));
    if (!email || !email.includes("@")) continue;
    const key = `${email}|${String(row.team_id ?? "").trim()}|${String(row.territorio_individual ?? "").trim()}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  return Array.from(unique.values());
}

async function loadRecipients(supabase: SupabaseClient, periodMonth: string) {
  const [managerResult, salesResult] = await Promise.all([
    supabase
      .from("manager_status")
      .select(
        "period_month, correo_manager, nombre_manager, team_id, territorio_manager, no_empleado_manager, is_active",
      )
      .eq("period_month", periodMonth)
      .eq("is_deleted", false),
    supabase
      .from("sales_force_status")
      .select(
        "period_month, correo_electronico, nombre_completo, team_id, territorio_individual, no_empleado, is_active",
      )
      .eq("period_month", periodMonth)
      .eq("is_deleted", false),
  ]);

  if (managerResult.error) {
    throw new Error(`No se pudo cargar manager_status: ${managerResult.error.message}`);
  }
  if (salesResult.error) {
    throw new Error(`No se pudo cargar sales_force_status: ${salesResult.error.message}`);
  }

  return {
    managers: dedupeManagers((managerResult.data ?? []) as ManagerPublishRow[]),
    sales: dedupeSales((salesResult.data ?? []) as SalesForcePublishRow[]),
  };
}

function resolvePeriodLabels(periodMonth: string) {
  const periodLabel = formatPeriodLong(periodMonth);
  const payDate = addMonths(periodDateFromMonth(periodMonth), 3);
  const payLabel = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(payDate);
  return { periodLabel, payLabel };
}

function buildManagerHtml(periodMonth: string, row: ManagerPublishRow, managerTemplate: string) {
  const { periodLabel, payLabel } = resolvePeriodLabels(periodMonth);
  const portalUrl = `${getBaseUrl()}/`;
  return renderTemplate(managerTemplate, {
    PORTAL_URL: escapeHtml(portalUrl),
    PERIODO_ANALIZADO: escapeHtml(periodLabel),
    PERIODO_PAGO: escapeHtml(payLabel),
    NOMBRE: escapeHtml(row.nombre_manager ?? "Sin nombre"),
    TEAM_ID: escapeHtml(row.team_id ?? "-"),
    TERRITORIO: escapeHtml(row.territorio_manager ?? "-"),
    ESTADO: escapeHtml(row.is_active ? "activo" : "inactivo"),
    EMPLEADO: escapeHtml(row.no_empleado_manager ?? "-"),
    ROLE_LABEL: "Manager",
  });
}

function buildSalesHtml(periodMonth: string, row: SalesForcePublishRow, salesTemplate: string) {
  const { periodLabel, payLabel } = resolvePeriodLabels(periodMonth);
  const portalUrl = `${getBaseUrl()}/`;
  return renderTemplate(salesTemplate, {
    PORTAL_URL: escapeHtml(portalUrl),
    PERIODO_ANALIZADO: escapeHtml(periodLabel),
    PERIODO_PAGO: escapeHtml(payLabel),
    NOMBRE: escapeHtml(row.nombre_completo ?? "Sin nombre"),
    TEAM_ID: escapeHtml(row.team_id ?? "-"),
    TERRITORIO: escapeHtml(row.territorio_individual ?? "-"),
    ESTADO: escapeHtml(row.is_active ? "activo" : "inactivo"),
    EMPLEADO: escapeHtml(row.no_empleado ?? "-"),
    ROLE_LABEL: "Fuerza de ventas",
  });
}

export async function getPublishPreviewBundle(params: {
  supabase: SupabaseClient;
  periodMonth: string;
}): Promise<PublishPreviewBundle> {
  const { managers, sales } = await loadRecipients(params.supabase, params.periodMonth);
  const { periodLabel, payLabel } = resolvePeriodLabels(params.periodMonth);

  const svm = managers.map((row) => {
    const email = normalizeEmail(String(row.correo_manager ?? ""));
    const teamId = String(row.team_id ?? "").trim() || "-";
    const territorio = String(row.territorio_manager ?? "").trim() || "-";
    return {
      key: `svm|${email}|${teamId}|${territorio}`,
      email,
      displayName: String(row.nombre_manager ?? "").trim() || "Sin nombre",
      teamId,
      territorio,
      empleado: String(row.no_empleado_manager ?? "-"),
      estado: row.is_active ? "activo" : "inactivo",
    } satisfies PublishPreviewRecipient;
  });

  const sva = sales.map((row) => {
    const email = normalizeEmail(String(row.correo_electronico ?? ""));
    const teamId = String(row.team_id ?? "").trim() || "-";
    const territorio = String(row.territorio_individual ?? "").trim() || "-";
    return {
      key: `sva|${email}|${teamId}|${territorio}`,
      email,
      displayName: String(row.nombre_completo ?? "").trim() || "Sin nombre",
      teamId,
      territorio,
      empleado: String(row.no_empleado ?? "-"),
      estado: row.is_active ? "activo" : "inactivo",
    } satisfies PublishPreviewRecipient;
  });

  return {
    periodMonth: params.periodMonth,
    periodLabel,
    payPeriodLabel: payLabel,
    svm,
    sva,
  };
}

export async function getPublishPreviewHtml(params: {
  supabase: SupabaseClient;
  periodMonth: string;
  type: PublishPreviewType;
  key: string | null | undefined;
}): Promise<string | null> {
  const { managers, sales } = await loadRecipients(params.supabase, params.periodMonth);
  const [managerTemplate, salesTemplate] = await Promise.all([
    loadTemplate("managers_publish.html"),
    loadTemplate("sales_force_publish.html"),
  ]);
  const wantedKey = String(params.key ?? "").trim();

  if (params.type === "svm") {
    const row =
      managers.find((item) => {
        const email = normalizeEmail(String(item.correo_manager ?? ""));
        const teamId = String(item.team_id ?? "").trim();
        const territorio = String(item.territorio_manager ?? "").trim();
        return `svm|${email}|${teamId || "-"}|${territorio || "-"}` === wantedKey;
      }) ?? managers[0];
    if (!row) return null;
    return buildManagerHtml(params.periodMonth, row, managerTemplate);
  }

  const row =
    sales.find((item) => {
      const email = normalizeEmail(String(item.correo_electronico ?? ""));
      const teamId = String(item.team_id ?? "").trim();
      const territorio = String(item.territorio_individual ?? "").trim();
      return `sva|${email}|${teamId || "-"}|${territorio || "-"}` === wantedKey;
    }) ?? sales[0];
  if (!row) return null;
  return buildSalesHtml(params.periodMonth, row, salesTemplate);
}

async function sendInBatches(items: Array<() => Promise<void>>, parallelism = 8) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, parallelism) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await items[current]();
    }
  });
  await Promise.all(workers);
}

export async function sendPublishEmailsForPeriod({
  supabase,
  periodMonth,
}: SendPublishEmailsParams): Promise<PublishEmailsSummary> {
  const [managerTemplate, salesTemplate] = await Promise.all([
    loadTemplate("managers_publish.html"),
    loadTemplate("sales_force_publish.html"),
  ]);
  const { managers, sales: salesForce } = await loadRecipients(supabase, periodMonth);
  const failures: string[] = [];
  const summary: PublishEmailsSummary = {
    managers: { attempted: managers.length, sent: 0, failed: 0 },
    salesForce: { attempted: salesForce.length, sent: 0, failed: 0 },
    failures,
  };

  const managerTasks = managers.map((row) => async () => {
    const to = normalizeEmail(String(row.correo_manager ?? ""));
    if (!to) return;
    const html = buildManagerHtml(periodMonth, row, managerTemplate);
    const result = await sendEmailWithSendGrid({
      to,
      subject: buildSubject(periodMonth),
      html,
      idempotencyKey: `publish:${periodMonth}:manager:${to}`,
    });
    if (result.ok) {
      summary.managers.sent += 1;
    } else {
      summary.managers.failed += 1;
      failures.push(`manager:${to} -> ${result.error ?? "error desconocido"}`);
    }
  });

  const salesTasks = salesForce.map((row) => async () => {
    const to = normalizeEmail(String(row.correo_electronico ?? ""));
    if (!to) return;
    const html = buildSalesHtml(periodMonth, row, salesTemplate);
    const result = await sendEmailWithSendGrid({
      to,
      subject: buildSubject(periodMonth),
      html,
      idempotencyKey: `publish:${periodMonth}:sales:${to}`,
    });
    if (result.ok) {
      summary.salesForce.sent += 1;
    } else {
      summary.salesForce.failed += 1;
      failures.push(`sales:${to} -> ${result.error ?? "error desconocido"}`);
    }
  });

  await sendInBatches(managerTasks, 6);
  await sendInBatches(salesTasks, 8);

  return summary;
}
