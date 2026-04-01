import { redirect } from "next/navigation";

type PageProps = {
  searchParams?: Promise<{
    periodo?: string;
  }>;
};

export default async function AdminCalculoAproveAliasPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const periodo = params?.periodo?.trim();
  if (periodo) {
    redirect(`/admin/calculo/aprobar?periodo=${encodeURIComponent(periodo)}`);
  }
  redirect("/admin/calculo/aprobar");
}

