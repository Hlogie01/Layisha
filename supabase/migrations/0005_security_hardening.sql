-- Layisha: security hardening
--  1. Delivery PIN: locks after 5 wrong tries (stops guessing all 10,000 PINs)
--  2. Driver links must be opened within 48 hours of being sent
--  3. Driver uploads: check the stop BEFORE a photo is stored
--  4. Customer location links stored as SHA-256 hashes, like driver links
--  5. Rate limiting table (used by the app server only)
--  6. Audit log: who changed what
--  7. forget_customer(): remove a customer's personal details (POPIA requests)
-- (pgcrypto's digest() is in the "extensions" schema on Supabase, hence search_path.)

-- ---------------------------------------------------------------------------
-- 1. PIN lockout
-- ---------------------------------------------------------------------------
alter table orders
  add column otp_attempts integer not null default 0,
  add column otp_locked_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Unused driver links expire after 48 hours
-- ---------------------------------------------------------------------------
create or replace function driver_from_token(p_token text)
returns table (driver_id uuid, company_id uuid)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select t.driver_id, t.company_id
  from driver_access_tokens t
  join drivers d on d.id = t.driver_id and d.active
  join companies c on c.id = t.company_id and c.is_logistics
  where t.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and t.revoked_at is null
    and (t.last_used_at is not null or t.created_at > now() - interval '48 hours');
$$;

revoke all on function driver_from_token(text) from public;

-- ---------------------------------------------------------------------------
-- 3. Check a stop before the app server stores a photo for it.
--    'ok' | 'already_recorded' (offline resend) | 'not_yours'
-- ---------------------------------------------------------------------------
create or replace function driver_stop_check(p_token text, p_order_id uuid, p_pod_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  me record;
begin
  select * into me from driver_from_token(p_token);
  if not found then
    return 'not_yours';
  end if;
  if exists (select 1 from proofs_of_delivery where id = p_pod_id and order_id = p_order_id) then
    return 'already_recorded';
  end if;
  if exists (
    select 1 from orders
    where id = p_order_id and driver_id = me.driver_id and company_id = me.company_id
      and status not in ('delivered', 'failed', 'cancelled')
  ) then
    return 'ok';
  end if;
  return 'not_yours';
end;
$$;

revoke all on function driver_stop_check(text, uuid, uuid) from public;
grant execute on function driver_stop_check(text, uuid, uuid) to anon, authenticated;

-- Recording an outcome now counts wrong PINs and locks the PIN after 5.
create or replace function driver_record_outcome(
  p_token text,
  p_pod_id uuid,
  p_order_id uuid,
  p_outcome text,
  p_captured_at timestamptz,
  p_lat double precision default null,
  p_lng double precision default null,
  p_gps_accuracy_m integer default null,
  p_photo_path text default null,
  p_otp text default null,
  p_no_otp_reason text default null,
  p_recipient_name text default null,
  p_failure_reason text default null,
  p_payment_method text default null,
  p_amount_collected numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me record;
  ord orders%rowtype;
  otp_ok boolean := false;
  attempts integer;
begin
  select * into me from driver_from_token(p_token);
  if not found then
    raise exception 'Driver link is not valid' using errcode = '28000';
  end if;

  -- Lets the audit log know which driver made the change.
  perform set_config('layisha.driver_id', me.driver_id::text, true);

  if p_outcome not in ('delivered', 'failed') then
    raise exception 'Unknown outcome';
  end if;

  if exists (select 1 from proofs_of_delivery where id = p_pod_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select * into ord from orders
  where id = p_order_id and driver_id = me.driver_id and company_id = me.company_id
  for update;
  if not found then
    raise exception 'This stop is no longer assigned to you';
  end if;
  if ord.status in ('delivered', 'failed', 'cancelled') then
    raise exception 'This stop is already closed';
  end if;

  if p_photo_path is not null
     and p_photo_path <> me.company_id::text || '/' || p_order_id::text || '/' || p_pod_id::text || '.jpg' then
    raise exception 'Invalid photo path';
  end if;

  if p_outcome = 'delivered' then
    if p_otp is not null and p_otp <> '' then
      if ord.otp_locked_at is not null then
        return jsonb_build_object('ok', false, 'error', 'pin_locked');
      end if;
      otp_ok := ord.otp_code is not null and p_otp = ord.otp_code;
      if not otp_ok then
        attempts := ord.otp_attempts + 1;
        update orders
        set otp_attempts = attempts,
            otp_locked_at = case when attempts >= 5 then now() else null end
        where id = ord.id;
        if attempts >= 5 then
          return jsonb_build_object('ok', false, 'error', 'pin_locked');
        end if;
        return jsonb_build_object('ok', false, 'error', 'wrong_pin', 'attempts_left', 5 - attempts);
      end if;
    elsif coalesce(trim(p_no_otp_reason), '') = '' then
      raise exception 'Enter the customer''s PIN or say why there is none';
    end if;
    if p_photo_path is null then
      raise exception 'A delivery photo is required';
    end if;
  else
    if coalesce(trim(p_failure_reason), '') = '' then
      raise exception 'Choose why the delivery failed';
    end if;
  end if;

  insert into proofs_of_delivery (
    id, company_id, order_id, driver_id, photo_path, lat, lng, gps_accuracy_m,
    otp_verified, recipient_name, captured_at, outcome, failure_reason, no_otp_reason
  ) values (
    p_pod_id, me.company_id, ord.id, me.driver_id, p_photo_path, p_lat, p_lng, p_gps_accuracy_m,
    otp_ok, nullif(left(trim(p_recipient_name), 120), ''), coalesce(p_captured_at, now()), p_outcome,
    nullif(left(trim(p_failure_reason), 200), ''), nullif(left(trim(p_no_otp_reason), 200), '')
  );

  if p_outcome = 'delivered' then
    update orders
    set status = 'delivered',
        delivered_at = coalesce(p_captured_at, now()),
        failure_reason = null
    where id = ord.id;

    if p_payment_method is not null and p_payment_method <> 'none'
       and coalesce(p_amount_collected, 0) > 0 then
      insert into payments (company_id, order_id, driver_id, method, amount, collected_at)
      values (me.company_id, ord.id, me.driver_id, p_payment_method::payment_method,
              p_amount_collected, coalesce(p_captured_at, now()));
    end if;
  else
    update orders
    set status = 'failed',
        failure_reason = nullif(left(trim(p_failure_reason), 200), '')
    where id = ord.id;
  end if;

  return jsonb_build_object('ok', true, 'otp_verified', otp_ok);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Hash customer location links
-- ---------------------------------------------------------------------------
alter table location_requests rename column token to token_hash;
update location_requests set token_hash = encode(digest(token_hash, 'sha256'), 'hex');

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
set search_path = public, extensions
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
  where lr.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and lr.expires_at > now();
$$;

create or replace function confirm_location(
  p_token text,
  p_lat double precision,
  p_lng double precision,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  req location_requests%rowtype;
  h text := encode(digest(p_token, 'sha256'), 'hex');
begin
  select * into req from location_requests
  where token_hash = h and expires_at > now();

  if not found then
    return false;
  end if;

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

  update location_requests set confirmed_at = now() where token_hash = h;

  if req.order_id is not null then
    update orders set status = 'confirmed'
    where id = req.order_id and status = 'new';
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Rate limiting (fixed windows). Only the app server (service role) may call it.
-- ---------------------------------------------------------------------------
create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

alter table rate_limits enable row level security;
-- No policies: only the service role (which bypasses RLS) touches this table.

create or replace function rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ws timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into rate_limits (key, window_start, hits)
  values (left(p_key, 200), ws, 1)
  on conflict (key, window_start) do update set hits = rate_limits.hits + 1
  returning hits into n;

  -- Occasional clean-up of old windows.
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  return n <= p_max;
end;
$$;

revoke all on function rate_limit_hit(text, integer, integer) from public;
revoke all on function rate_limit_hit(text, integer, integer) from anon, authenticated;
grant execute on function rate_limit_hit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Audit log
-- ---------------------------------------------------------------------------
create table audit_log (
  id bigserial primary key,
  company_id uuid not null references companies(id) on delete cascade,
  actor_user_id uuid,
  actor_driver_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create index audit_log_company_idx on audit_log(company_id, at desc);

alter table audit_log enable row level security;
create policy "owners read audit log" on audit_log
  for select using (is_company_owner(company_id));
-- No insert/update/delete policies: entries are written by triggers only and can't be edited.

create or replace function audit_write(
  p_company uuid, p_action text, p_entity text, p_entity_id uuid, p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (company_id, actor_user_id, actor_driver_id, action, entity, entity_id, details)
  values (
    p_company,
    auth.uid(),
    nullif(current_setting('layisha.driver_id', true), '')::uuid,
    p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

revoke all on function audit_write(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

create or replace function audit_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform audit_write(new.company_id, 'order.created', 'order', new.id,
      jsonb_build_object('reference', new.reference));
  elsif tg_op = 'DELETE' then
    perform audit_write(old.company_id, 'order.deleted', 'order', old.id,
      jsonb_build_object('reference', old.reference));
  else
    if new.status is distinct from old.status then
      perform audit_write(new.company_id, 'order.status', 'order', new.id,
        jsonb_build_object('reference', new.reference, 'from', old.status, 'to', new.status));
    end if;
    if new.driver_id is distinct from old.driver_id then
      perform audit_write(new.company_id, 'order.driver', 'order', new.id,
        jsonb_build_object('reference', new.reference, 'from', old.driver_id, 'to', new.driver_id));
    end if;
    if new.otp_code is distinct from old.otp_code then
      perform audit_write(new.company_id, 'order.pin_reset', 'order', new.id,
        jsonb_build_object('reference', new.reference));
    end if;
    if new.otp_locked_at is not null and old.otp_locked_at is null then
      perform audit_write(new.company_id, 'order.pin_locked', 'order', new.id,
        jsonb_build_object('reference', new.reference));
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger orders_audit after insert or update or delete on orders
for each row execute function audit_orders();

create or replace function audit_drivers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform audit_write(new.company_id, 'driver.added', 'driver', new.id, jsonb_build_object('name', new.name));
  elsif new.active is distinct from old.active then
    perform audit_write(new.company_id, case when new.active then 'driver.reactivated' else 'driver.deactivated' end,
      'driver', new.id, jsonb_build_object('name', new.name));
  end if;
  return new;
end;
$$;

create trigger drivers_audit after insert or update on drivers
for each row execute function audit_drivers();

create or replace function audit_driver_tokens()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform audit_write(new.company_id, 'driver.link_created', 'driver', new.driver_id, '{}'::jsonb);
  elsif new.revoked_at is not null and old.revoked_at is null then
    perform audit_write(new.company_id, 'driver.link_revoked', 'driver', new.driver_id, '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger driver_tokens_audit after insert or update on driver_access_tokens
for each row execute function audit_driver_tokens();

create or replace function audit_companies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_logistics is distinct from old.is_logistics or new.is_vendor is distinct from old.is_vendor then
    perform audit_write(new.id, 'company.roles', 'company', new.id,
      jsonb_build_object('is_logistics', new.is_logistics, 'is_vendor', new.is_vendor));
  end if;
  return new;
end;
$$;

create trigger companies_audit after update on companies
for each row execute function audit_companies();

-- ---------------------------------------------------------------------------
-- 7. Forget a customer (POPIA deletion request). Owner only.
--    Keeps the orders (for the business's records) but removes personal details.
--    Returns the delivery photo paths so the app server can delete the files.
-- ---------------------------------------------------------------------------
create or replace function forget_customer(p_customer_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  cust customers%rowtype;
  paths text[];
begin
  select * into cust from customers where id = p_customer_id;
  if not found or not is_company_owner(cust.company_id) then
    raise exception 'Only the account owner can remove customer details';
  end if;

  select coalesce(array_agg(p.photo_path) filter (where p.photo_path is not null), '{}')
  into paths
  from proofs_of_delivery p join orders o on o.id = p.order_id
  where o.customer_id = cust.id;

  update proofs_of_delivery p
  set photo_path = null, recipient_name = null, lat = null, lng = null
  from orders o
  where o.id = p.order_id and o.customer_id = cust.id;

  delete from location_requests where customer_id = cust.id;

  update customers
  set name = 'Removed customer',
      whatsapp = 'removed-' || cust.id::text,
      address_text = null,
      lat = null,
      lng = null,
      landmark_note = null,
      landmark_photo_path = null,
      location_confirmed_at = null
  where id = cust.id;

  perform audit_write(cust.company_id, 'customer.forgotten', 'customer', cust.id, '{}'::jsonb);
  return paths;
end;
$$;

revoke all on function forget_customer(uuid) from public, anon;
grant execute on function forget_customer(uuid) to authenticated;
