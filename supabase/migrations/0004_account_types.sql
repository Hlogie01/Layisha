-- Layisha: account types
-- A company can deliver goods (logistics), rent out vehicles (vendor), or both.
-- Vendor-only accounts must never reach delivery data, so every delivery table's
-- policy now also checks that the company has the logistics role switched on.

alter table companies
  add column is_logistics boolean not null default true,
  add column is_vendor boolean not null default false,
  add constraint companies_has_a_role check (is_logistics or is_vendor);

-- What a vendor told us when signing up. The full marketplace (listings,
-- verification, enquiries) comes in Phase 2; for now this is the waitlist.
create table vendor_profiles (
  company_id uuid primary key references companies(id) on delete cascade,
  service_area text,
  vehicle_types text[] not null default '{}',
  fleet_size integer check (fleet_size is null or fleet_size between 1 and 10000),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger vendor_profiles_touch before update on vendor_profiles
for each row execute function touch_updated_at();

alter table vendor_profiles enable row level security;

create or replace function is_vendor_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from company_members m join companies c on c.id = m.company_id
    where m.company_id = cid and m.user_id = auth.uid() and c.is_vendor
  );
$$;

create or replace function is_logistics_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from company_members m join companies c on c.id = m.company_id
    where m.company_id = cid and m.user_id = auth.uid() and c.is_logistics
  );
$$;

grant execute on function is_vendor_member(uuid) to authenticated;
grant execute on function is_logistics_member(uuid) to authenticated;

create policy "vendor members all vendor profile" on vendor_profiles
  for all using (is_vendor_member(company_id)) with check (is_vendor_member(company_id));

-- Delivery data: logistics companies only.
drop policy "members all drivers" on drivers;
drop policy "members all customers" on customers;
drop policy "members all orders" on orders;
drop policy "members all pods" on proofs_of_delivery;
drop policy "members all payments" on payments;
drop policy "members all location requests" on location_requests;
drop policy "members all driver tokens" on driver_access_tokens;

create policy "logistics members all drivers" on drivers
  for all using (is_logistics_member(company_id)) with check (is_logistics_member(company_id));
create policy "logistics members all customers" on customers
  for all using (is_logistics_member(company_id)) with check (is_logistics_member(company_id));
create policy "logistics members all orders" on orders
  for all using (is_logistics_member(company_id)) with check (is_logistics_member(company_id));
create policy "logistics members all pods" on proofs_of_delivery
  for all using (is_logistics_member(company_id)) with check (is_logistics_member(company_id));
create policy "logistics members all payments" on payments
  for all using (is_logistics_member(company_id)) with check (is_logistics_member(company_id));
create policy "logistics members all location requests" on location_requests
  for all using (is_logistics_member(company_id)) with check (is_logistics_member(company_id));
create policy "logistics members all driver tokens" on driver_access_tokens
  for all using (is_logistics_member(company_id)) with check (is_logistics_member(company_id));

create or replace function next_order_reference(cid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not is_logistics_member(cid) then
    raise exception 'Not a member of this delivery company';
  end if;

  insert into company_counters (company_id, last_order_number)
  values (cid, 1)
  on conflict (company_id)
  do update set last_order_number = company_counters.last_order_number + 1
  returning last_order_number into n;

  return 'LY-' || lpad(n::text, 5, '0');
end;
$$;

-- Sign-up now says which roles the company has.
drop function create_company(text, text, text);

create or replace function create_company(
  p_name text,
  p_phone text default null,
  p_city text default null,
  p_is_logistics boolean default true,
  p_is_vendor boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not (coalesce(p_is_logistics, false) or coalesce(p_is_vendor, false)) then
    raise exception 'Choose at least one: deliver goods or rent out vehicles';
  end if;

  insert into companies (name, phone, city, is_logistics, is_vendor)
  values (trim(p_name), nullif(trim(p_phone), ''), nullif(trim(p_city), ''),
          coalesce(p_is_logistics, false), coalesce(p_is_vendor, false))
  returning id into new_id;

  insert into company_members (company_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  return new_id;
end;
$$;

grant execute on function create_company(text, text, text, boolean, boolean) to authenticated;

-- Owners switch a role on later (e.g. a delivery company that also rents out a truck).
-- Roles are only ever added here; removing one is a support request for now,
-- so nobody loses access to their data by accident.
create or replace function enable_company_role(cid uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_company_owner(cid) then
    raise exception 'Only the owner can change this';
  end if;
  if p_role = 'vendor' then
    update companies set is_vendor = true where id = cid;
  elsif p_role = 'logistics' then
    update companies set is_logistics = true where id = cid;
  else
    raise exception 'Unknown role';
  end if;
end;
$$;

grant execute on function enable_company_role(uuid, text) to authenticated;

-- The owners' update policy must not let them flip roles directly.
create or replace function protect_company_roles()
returns trigger
language plpgsql
as $$
begin
  if (new.is_logistics is distinct from old.is_logistics
      or new.is_vendor is distinct from old.is_vendor)
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Use enable_company_role() to change account type';
  end if;
  return new;
end;
$$;

create trigger companies_protect_roles before update on companies
for each row execute function protect_company_roles();
