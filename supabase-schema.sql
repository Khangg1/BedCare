create table if not exists public.hospital_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.beds (
  code text primary key,
  department text not null,
  bed_type text not null check (bed_type in ('single', 'double')),
  status text not null check (status in ('available', 'occupied', 'cleaning')),
  patients text[] not null default '{}',
  since text not null default '',
  admitted_at text not null default '',
  discharged_at text not null default '',
  constraint beds_patient_capacity check (
    cardinality(patients) <= case when bed_type = 'double' then 2 else 1 end
  ),
  constraint beds_occupancy_matches_patients check (
    (status = 'occupied' and cardinality(patients) > 0)
    or (status <> 'occupied' and cardinality(patients) = 0)
  )
);

alter table public.hospital_members enable row level security;
alter table public.beds enable row level security;

drop policy if exists "Members can view their own membership" on public.hospital_members;
create policy "Members can view their own membership"
  on public.hospital_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Hospital members can read beds" on public.beds;
create policy "Hospital members can read beds"
  on public.beds for select to authenticated
  using (exists (
    select 1 from public.hospital_members
    where hospital_members.user_id = (select auth.uid())
  ));

drop policy if exists "Hospital members can add beds" on public.beds;
create policy "Hospital members can add beds"
  on public.beds for insert to authenticated
  with check (exists (
    select 1 from public.hospital_members
    where hospital_members.user_id = (select auth.uid())
  ));

drop policy if exists "Hospital members can update beds" on public.beds;
create policy "Hospital members can update beds"
  on public.beds for update to authenticated
  using (exists (
    select 1 from public.hospital_members
    where hospital_members.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.hospital_members
    where hospital_members.user_id = (select auth.uid())
  ));

drop policy if exists "Hospital members can delete beds" on public.beds;
create policy "Hospital members can delete beds"
  on public.beds for delete to authenticated
  using (exists (
    select 1 from public.hospital_members
    where hospital_members.user_id = (select auth.uid())
  ));

grant usage on schema public to authenticated;
grant select on public.hospital_members to authenticated;
grant select, insert, update, delete on public.beds to authenticated;

insert into public.hospital_members (user_id)
values ('ae39ce7b-d6eb-4902-807c-91fb7a7aebc6')
on conflict (user_id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'beds'
  ) then
    alter publication supabase_realtime add table public.beds;
  end if;
end
$$;
