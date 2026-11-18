-- Layisha: customer location confirmation
-- A business sends a customer a private link (by WhatsApp). The customer opens it,
-- shares their GPS pin and a landmark note, and it is saved to their profile.
-- The customer never logs in, so the public page talks to the database only
-- through the two security-definer functions below, which check the token.

create table location_requests (
  token text primary key,                 -- random, unguessable, from the app server
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  confirmed_at timestamptz,
  check (char_length(token) >= 32)
);

create index location_requests_customer_idx on location_requests(customer_id);

alter table location_requests enable row level security;

create policy "members all location requests" on location_requests
  for all using (is_company_member(company_id)) with check (is_company_member(company_id));

-- A request may only point at a customer (and order) of the same company.
create or replace function check_location_request_same_company()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from customers where id = new.customer_id and company_id = new.company_id) then
    raise exception 'Customer belongs to a different company';
  end if;
  if new.order_id is not null
     and not exists (select 1 from orders where id = new.order_id and company_id = new.company_id) then
    raise exception 'Order belongs to a different company';
  end if;
  return new;
end;
$$;

create trigger location_requests_same_company before insert or update on location_requests
for each row execute function check_location_request_same_company();

-- Public: what the confirmation page needs to show. Returns nothing for an
-- unknown or expired token. Only first names and business name are exposed.
create or replace function get_location_request(p_token text)
returns table (
  company_name text,
  customer_first_name text,
  order_reference text,
  delivery_date date,
  already_confirmed boolean,
  saved_note text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    co.name,
    split_part(cu.name, ' ', 1),
    o.reference,
    o.delivery_date,
    lr.confirmed_at is not null,
    cu.landmark_note
  from location_requests lr
  join companies co on co.id = lr.company_id
  join customers cu on cu.id = lr.customer_id
  left join orders o on o.id = lr.order_id
  where lr.token = p_token
    and lr.expires_at > now();
$$;

-- Public: save the customer's pin and note. Can be called again before the
-- link expires, so a customer can correct a wrong pin.
create or replace function confirm_location(
  p_token text,
  p_lat double precision,
  p_lng double precision,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  req location_requests%rowtype;
begin
  select * into req from location_requests
  where token = p_token and expires_at > now();

  if not found then
    return false;
  end if;

  -- Rough bounding box for Southern Africa, to catch obviously wrong pins.
  if p_lat is null or p_lng is null
     or p_lat not between -35.5 and -8.0
     or p_lng not between 10.0 and 41.0 then
    raise exception 'Location is outside the delivery area';
  end if;

  update customers
  set lat = p_lat,
      lng = p_lng,
      landmark_note = coalesce(nullif(left(trim(p_note), 500), ''), landmark_note),
      location_confirmed_at = now()
  where id = req.customer_id;

  update location_requests set confirmed_at = now() where token = p_token;

  if req.order_id is not null then
    update orders set status = 'confirmed'
    where id = req.order_id and status = 'new';
  end if;

  return true;
end;
$$;

revoke all on function get_location_request(text) from public;
revoke all on function confirm_location(text, double precision, double precision, text) from public;
grant execute on function get_location_request(text) to anon, authenticated;
grant execute on function confirm_location(text, double precision, double precision, text) to anon, authenticated;
