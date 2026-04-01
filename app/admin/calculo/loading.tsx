export default function AdminCalculoLoading() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="h-4 w-36 animate-pulse rounded bg-neutral-200" />
          <div className="mt-3 h-8 w-64 animate-pulse rounded bg-neutral-200" />
          <div className="mt-3 h-4 w-[30rem] max-w-full animate-pulse rounded bg-neutral-100" />
        </header>
        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-4 h-5 w-40 animate-pulse rounded bg-neutral-200" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded bg-neutral-100" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
