
create table public.team_config_drafts (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  snapshot jsonb not null default '{}',
  is_applied boolean not null default false,
  applied_at timestamptz,
  applied_by text,
  created_at timestamptz not null default now(),
  created_by text,
  label text,
  unique(department_id, created_at)
);

alter table public.team_config_drafts enable row level security;

create policy "Only admins can manage team config drafts"
  on public.team_config_drafts for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));
