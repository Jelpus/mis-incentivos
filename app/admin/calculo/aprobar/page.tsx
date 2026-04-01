import { CalculoActionPage } from "@/components/admin/calculo-action-page";

type PageProps = {
  searchParams?: Promise<{
    periodo?: string;
  }>;
};

export default async function AdminCalculoAprobarPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  return (
    <CalculoActionPage
      breadcrumb="Admin / Calculo / Aprobar"
      title="Aprobar periodo"
      description="Confirma el precalculo y cambia el estatus del periodo a final."
      submitLabel="Aprobar periodo"
      actionKey="aprobar"
      periodParam={params?.periodo ?? null}
    />
  );
}

