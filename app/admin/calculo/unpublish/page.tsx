import { CalculoActionPage } from "@/components/admin/calculo-action-page";

type PageProps = {
  searchParams?: Promise<{
    periodo?: string;
  }>;
};

export default async function AdminCalculoUnpublishPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  return (
    <CalculoActionPage
      breadcrumb="Admin / Calculo / Despublicar"
      title="Despublicar periodo"
      description="Retira una publicacion y regresa el periodo a estatus final."
      submitLabel="Despublicar periodo"
      actionKey="despublicar"
      periodParam={params?.periodo ?? null}
    />
  );
}

