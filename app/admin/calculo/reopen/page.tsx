import { CalculoActionPage } from "@/components/admin/calculo-action-page";

type PageProps = {
  searchParams?: Promise<{
    periodo?: string;
  }>;
};

export default async function AdminCalculoReopenPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  return (
    <CalculoActionPage
      breadcrumb="Admin / Calculo / Regresar a precalculo"
      title="Regresar periodo a precalculo"
      description="Reabre un periodo final para realizar ajustes y aprobarlo nuevamente."
      submitLabel="Regresar a precalculo"
      actionKey="reabrir"
      periodParam={params?.periodo ?? null}
    />
  );
}
