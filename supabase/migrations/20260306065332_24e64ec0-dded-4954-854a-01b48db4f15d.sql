
create table public.schedule_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete cascade not null,
  role text not null,
  content text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.schedule_ai_conversations enable row level security;

create policy "Authenticated can manage schedule_ai_conversations"
  on public.schedule_ai_conversations
  for all to authenticated using (true) with check (true);

create index idx_schedule_ai_conversations_dept on public.schedule_ai_conversations(department_id, created_at);
