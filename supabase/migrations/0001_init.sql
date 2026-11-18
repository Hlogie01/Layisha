-- Layisha: initial schema
-- Multi-tenant: every business row belongs to a company, and row-level security
-- makes sure users only ever see data for companies they are members of.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type member_role as enum ('owner', 'dispatcher');
create type order_status as enum ('new', 'confirmed', 'out_for_delivery', 'delivered', 'failed', 'cancelled');
create type payment_type as enum ('prepaid', 'cash', 'eft', 'card');
create type payment_method as enum ('cash', 'eft', 'card', 'none');

-- ---------------------------------------------------------------------------
-- Companies and members
-- ---------------------------------------------------------------------------
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  phone text,
  city text,
  created_at timestamptz not null default now()
);

create table company_members (
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'dispatcher',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index company_members_user_idx on company_members(user_id);

-- Security-definer helper so policies can check membership without recursion.
create or replace function is_company_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from company_members
    where company_id = cid and user_id = auth.uid()
  );
$$;

create or replace function is_company_owner(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from company_members
    where company_id = cid and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Creates a company and makes the caller its owner, in one step.
create or replace function create_company(p_name text, p_phone text default null, p_city text default null)
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

  insert into companies (name, phone, city)
  values (trim(p_name), nullif(trim(p_phone), ''), nullif(trim(p_city), ''))
  returning id into new_id;

  insert into company_members (company_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Drivers
-- ---------------------------------------------------------------------------
create table drivers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  phone text not null,
  vehicle text,                -- e.g. "Toyota Hilux, GP 123-456"
  user_id uuid references auth.users(id) on delete set null, -- set when the driver gets an app login
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index drivers_company_idx on drivers(company_id);

-- ---------------------------------------------------------------------------
-- Customers (end customers who receive deliveries)
-- ---------------------------------------------------------------------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  whatsapp text not null,           -- E.164 format, e.g. +27821234567
  address_text text,                -- whatever the customer or owner typed
  lat double precision,
  lng double precision,
  landmark_note text,               -- "blue gate next to the spaza"
  landmark_photo_path text,         -- storage path
  location_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, whatsapp)
);

create index customers_company_idx on customers(company_id);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  reference text not null,          -- short human reference, e.g. LY-00042
  customer_id uuid not null references customers(id) on delete restrict,
  driver_id uuid references drivers(id) on delete set null,
  items text not null,              -- free text for the MVP, e.g. "2x 9kg gas, 1x regulator"
  amount_due numeric(12,2) not null default 0 check (amount_due >= 0),
  payment_type payment_type not null default 'cash',
  status order_status not null default 'new',
  delivery_date date not null default current_date,
  notes text,
  otp_code text,                    -- 4-digit code sent to the customer on WhatsApp
  failure_reason text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, reference)
);

create index orders_company_date_idx on orders(company_id, delivery_date);
create index orders_driver_idx on orders(driver_id);

-- Per-company running number for order references.
create table company_counters (
  company_id uuid primary key references companies(id) on delete cascade,
  last_order_number integer not null default 0
);

create or replace function next_order_reference(cid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not is_company_member(cid) then
    raise exception 'Not a member of this company';
  end if;

  insert into company_counters (company_id, last_order_number)
  values (cid, 1)
  on conflict (company_id)
  do update set last_order_number = company_counters.last_order_number + 1
  returning last_order_number into n;

  return 'LY-' || lpad(n::text, 5, '0');
end;
$$;

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_touch before update on orders
for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Proof of delivery and payments
-- ---------------------------------------------------------------------------
create table proofs_of_delivery (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  driver_id uuid references drivers(id) on delete set null,
  photo_path text,
  lat double precision,
  lng double precision,
  otp_verified boolean not null default false,
  recipient_name text,
  captured_at timestamptz not null default now(),  -- time on the driver's phone
  synced_at timestamptz not null default now()      -- time it reached the server
);

create index pod_order_idx on proofs_of_delivery(order_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  driver_id uuid references drivers(id) on delete set null,
  method payment_method not null,
  amount numeric(12,2) not null check (amount >= 0),
  collected_at timestamptz not null default now()
);

create index payments_company_idx on payments(company_id, collected_at);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table companies enable row level security;
alter table company_members enable row level security;
alter table company_counters enable row level security;
alter table drivers enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table proofs_of_delivery enable row level security;
alter table payments enable row level security;

-- Companies: members can read; owners can update. Creation goes through create_company().
create policy "members read company" on companies
  for select using (is_company_member(id));
create policy "owners update company" on companies
  for update using (is_company_owner(id)) with check (is_company_owner(id));

-- Members: you can see the member list of your companies; owners manage it.
create policy "members read members" on company_members
  for select using (is_company_member(company_id));
create policy "owners add members" on company_members
  for insert with check (is_company_owner(company_id));
create policy "owners remove members" on company_members
  for delete using (is_company_owner(company_id));

-- Counters are only touched through next_order_reference().

-- Everything else: full access for members of the owning company.
create policy "members all drivers" on drivers
  for all using (is_company_member(company_id)) with check (is_company_member(company_id));
create policy "members all customers" on customers
  for all using (is_company_member(company_id)) with check (is_company_member(company_id));
create policy "members all orders" on orders
  for all using (is_company_member(company_id)) with check (is_company_member(company_id));
create policy "members all pods" on proofs_of_delivery
  for all using (is_company_member(company_id)) with check (is_company_member(company_id));
create policy "members all payments" on payments
  for all using (is_company_member(company_id)) with check (is_company_member(company_id));

-- An order may only point at a customer and driver from the same company.
create or replace function check_order_same_company()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from customers where id = new.customer_id and company_id = new.company_id) then
    raise exception 'Customer belongs to a different company';
  end if;
  if new.driver_id is not null
     and not exists (select 1 from drivers where id = new.driver_id and company_id = new.company_id) then
    raise exception 'Driver belongs to a different company';
  end if;
  return new;
end;
$$;

create trigger orders_same_company before insert or update on orders
for each row execute function check_order_same_company();

grant execute on function create_company(text, text, text) to authenticated;
grant execute on function next_order_reference(uuid) to authenticated;
grant execute on function is_company_member(uuid) to authenticated;
grant execute on function is_company_owner(uuid) to authenticated;
