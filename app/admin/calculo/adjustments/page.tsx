import { CalculoActionPage } from "@/components/admin/calculo-action-page";

type PageProps = {
  searchParams?: Promise<{
    periodo?: string;
  }>;
};

export default async function AdminCalculoAdjustmentsPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  return (
    <CalculoActionPage
      breadcrumb="Admin / Calculo / Ajustar"
      title="Ajustes de calculo"
      description="Prepara el flujo de ajustes del periodo. Por ahora, la accion conserva el estatus en precalculo."
      submitLabel="Aplicar ajuste"
      actionKey="ajustar"
      periodParam={params?.periodo ?? null}
    />
  );
}

