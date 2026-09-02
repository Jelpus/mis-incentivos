type SupabaseErrorLike = {
  code?: string;
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

function buildPaginatedQueryError(context: string, error: SupabaseErrorLike, fallback: string): Error & { code?: string } {
  const output = new Error(`${context}: ${error?.message ?? fallback}`) as Error & { code?: string };
  if (error?.code) output.code = error.code;
  return output;
}

export async function fetchAllSupabaseRows<T>(params: {
  countQuery: () => PromiseLike<SupabaseCountResult>;
  pageQuery: (from: number, to: number) => PromiseLike<SupabaseRowsResult<T>>;
  pageSize?: number;
  context: string;
}): Promise<T[]> {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const countResult = await params.countQuery();

  if (countResult.error) {
    throw buildPaginatedQueryError(params.context, countResult.error, "error al contar filas");
  }

  const totalRows = countResult.count ?? 0;
  if (totalRows <= 0) return [];

  const rows: T[] = [];
  for (let from = 0; from < totalRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, totalRows - 1);
    const pageResult = await params.pageQuery(from, to);

    if (pageResult.error) {
      throw buildPaginatedQueryError(params.context, pageResult.error, "error al leer filas");
    }

    const batch = pageResult.data ?? [];
    rows.push(...batch);
    if (batch.length === 0) break;
  }

  return rows;
}
