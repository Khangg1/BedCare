create table if not exists public.hospital_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

alter table public.hospital_members
  add column if not exists role text not null default 'member'
  check (role in ('admin', 'member'));

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

create or replace function public.is_hospital_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hospital_members
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_hospital_admin() from public;
grant execute on function public.is_hospital_admin() to authenticated;

drop policy if exists "Members can view their own membership" on public.hospital_members;
create policy "Members can view their own membership"
  on public.hospital_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_hospital_admin());

drop policy if exists "Admins can add members" on public.hospital_members;
create policy "Admins can add members"
  on public.hospital_members for insert to authenticated
  with check (public.is_hospital_admin() and role = 'member');

drop policy if exists "Admins can remove members" on public.hospital_members;
create policy "Admins can remove members"
  on public.hospital_members for delete to authenticated
  using (public.is_hospital_admin() and role = 'member' and user_id <> (select auth.uid()));

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
grant select, insert, delete on public.hospital_members to authenticated;
grant select, insert, update, delete on public.beds to authenticated;

insert into public.hospital_members (user_id)
values
  ('ae39ce7b-d6eb-4902-807c-91fb7a7aebc6'),
  ('64f197b9-b119-463d-a0de-5ed6c3a561aa')
on conflict (user_id) do nothing;

update public.hospital_members
set role = case
  when user_id = 'ae39ce7b-d6eb-4902-807c-91fb7a7aebc6' then 'admin'
  when user_id = '64f197b9-b119-463d-a0de-5ed6c3a561aa' then 'member'
end
where user_id in (
  'ae39ce7b-d6eb-4902-807c-91fb7a7aebc6',
  '64f197b9-b119-463d-a0de-5ed6c3a561aa'
);

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
