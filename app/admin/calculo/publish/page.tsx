import { CalculoActionPage } from "@/components/admin/calculo-action-page";

type PageProps = {
  searchParams?: Promise<{
    periodo?: string;
  }>;
};

export default async function AdminCalculoPublishPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  return (
    <CalculoActionPage
      breadcrumb="Admin / Calculo / Publicar"
      title="Publicar periodo"
      description="Publica el resultado final del periodo para habilitar su consumo operativo."
      submitLabel="Publicar periodo"
      actionKey="publicar"
      periodParam={params?.periodo ?? null}
    />
  );
}

