type SupabaseErrorLike = {
  message?: string;
} | null;

type SupabaseCountResult = {
  count: number | null;
  error: SupabaseErrorLike;
};

type SupabaseRowsResult<T> = {
  data: T[] | null;
  error: SupabaseErrorLike;
};

const DEFAULT_PAGE_SIZE = 1000;

export async function fetchAllSupabaseRows<T>(params: {
  countQuery: () => PromiseLike<SupabaseCountResult>;
  pageQuery: (from: number, to: number) => PromiseLike<SupabaseRowsResult<T>>;
  pageSize?: number;
  context: string;
}): Promise<T[]> {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const countResult = await params.countQuery();

  if (countResult.error) {
    throw new Error(`${params.context}: ${countResult.error.message ?? "error al contar filas"}`);
  }

  const totalRows = countResult.count ?? 0;
  if (totalRows <= 0) return [];

  const rows: T[] = [];
  for (let from = 0; from < totalRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, totalRows - 1);
    const pageResult = await params.pageQuery(from, to);

    if (pageResult.error) {
      throw new Error(`${params.context}: ${pageResult.error.message ?? "error al leer filas"}`);
    }

    const batch = pageResult.data ?? [];
    rows.push(...batch);
    if (batch.length === 0) break;
  }

  return rows;
}
