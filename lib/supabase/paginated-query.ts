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
  countQuery?: () => PromiseLike<SupabaseCountResult>;
  pageQuery: (from: number, to: number) => PromiseLike<SupabaseRowsResult<T>>;
  pageSize?: number;
  context: string;
}): Promise<T[]> {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > DEFAULT_PAGE_SIZE) {
    throw new Error(`${params.context}: pageSize debe ser un entero entre 1 y ${DEFAULT_PAGE_SIZE}`);
  }

  let totalRows: number | null = null;
  if (params.countQuery) {
    const countResult = await params.countQuery();

    if (countResult.error) {
      throw buildPaginatedQueryError(params.context, countResult.error, "error al contar filas");
    }

    totalRows = countResult.count ?? 0;
    if (totalRows <= 0) return [];
  }

  const rows: T[] = [];
  for (let from = 0; totalRows === null || from < totalRows; from += pageSize) {
    const to = totalRows === null ? from + pageSize - 1 : Math.min(from + pageSize - 1, totalRows - 1);
    const pageResult = await params.pageQuery(from, to);

    if (pageResult.error) {
      throw buildPaginatedQueryError(params.context, pageResult.error, "error al leer filas");
    }

    const batch = pageResult.data ?? [];
    rows.push(...batch);
    if (batch.length < to - from + 1) break;
  }

  return rows;
}
