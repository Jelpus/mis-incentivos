create table if not exists public.admin_bug_reports (
  id uuid primary key default gen_random_uuid(),
  title text,
  description text not null,
  period text,
  representative_name text,
  product text,
  metric text,
  expected_value numeric,
  actual_value numeric,
  difference numeric,
  status text default 'open',
  priority text default 'normal',
  created_by uuid,
  created_by_email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.admin_bug_diagnoses (
  id uuid primary key default gen_random_uuid(),
  bug_report_id uuid references public.admin_bug_reports(id) on delete cascade,
  diagnosis_summary text,
  suspected_cause text,
  recommended_fix text,
  confidence_score numeric,
  trace_data jsonb,
  ai_response text,
  created_at timestamptz default now()
);

create index if not exists admin_bug_reports_created_at_idx
  on public.admin_bug_reports (created_at desc);

create index if not exists admin_bug_reports_status_idx
  on public.admin_bug_reports (status);

create index if not exists admin_bug_diagnoses_bug_report_id_idx
  on public.admin_bug_diagnoses (bug_report_id);
