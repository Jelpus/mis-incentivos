# Repository data-access rules

- Every Supabase `select` that returns a collection must be paginated with `fetchAllSupabaseRows` from `lib/supabase/paginated-query.ts`.
- Every paginated query must use a deterministic order that ends in a unique column such as `id`.
- Do not use `limit(1000)` or rely on the Supabase API row cap to mean "all rows".
- Pagination is unnecessary only for an explicitly bounded result: `single`, `maybeSingle`, a count/head query, or a deliberate product requirement such as "latest 10". Keep that bound visible in the query.
- When adding or modifying a collection query, include a pagination test or exercise it with more than 1,000 rows when practical.
