-- Layisha: driver app and proof of delivery
-- (pgcrypto's digest() lives in the "extensions" schema on Supabase, hence the search_path.)
--
-- Drivers don't create accounts. The owner sends each driver a personal app link
-- on WhatsApp. Opening it signs the driver in on that phone. Only a SHA-256 hash
-- of the link's secret is stored, so a database leak doesn't reveal working links.
-- The driver app talks to the database only through the security-definer
-- functions below, which check the secret and only expose that driver's own stops.

create table driver_access_tokens (
  token_hash text primary key,              -- hex sha256 of the secret in the link
  driver_id uuid not null references drivers(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index driver_access_tokens_driver_idx on driver_access_tokens(driver_id);

alter table driver_access_tokens enable row level security;

create policy "members all driver tokens" on driver_access_tokens
  for all using (is_company_member(company_id)) with check (is_company_member(company_id));

create or replace function check_driver_token_same_company()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from drivers where id = new.driver_id and company_id = new.company_id) then
    raise exception 'Driver belongs to a different company';
  end if;
  return new;
end;
$$;

create trigger driver_tokens_same_company before insert or update on driver_access_tokens
for each row execute function check_driver_token_same_company();

-- Extra proof-of-delivery details.
alter table proofs_of_delivery
  add column outcome text not null default 'delivered' check (outcome in ('delivered', 'failed')),
  add column failure_reason text,
  add column no_otp_reason text,
  add column gps_accuracy_m integer;

-- ---------------------------------------------------------------------------
-- Internal: resolve a link secret to its driver. Returns nothing if the link
-- is unknown, revoked, or the driver has been deactivated.
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
  where t.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and t.revoked_at is null;
$$;

revoke all on function driver_from_token(text) from public;

-- Public: who is this driver? Used when the link is opened.
create or replace function driver_whoami(p_token text)
returns table (driver_id uuid, driver_name text, company_id uuid, company_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me record;
begin
  select * into me from driver_from_token(p_token);
  if not found then
    return;
  end if;

  update driver_access_tokens
  set last_used_at = now()
  where token_hash = encode(digest(p_token, 'sha256'), 'hex');

  return query
  select d.id, d.name, c.id, c.name
  from drivers d join companies c on c.id = d.company_id
  where d.id = me.driver_id;
end;
$$;

-- Public: the driver's stops for a day, as JSON.
create or replace function driver_run(p_token text, p_date date)
returns jsonb
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
    return null;
  end if;

  return coalesce((
    select jsonb_agg(stop order by stop->>'created_at')
    from (
      select jsonb_build_object(
        'id', o.id,
        'reference', o.reference,
        'items', o.items,
        'amount_due', o.amount_due,
        'payment_type', o.payment_type,
        'status', o.status,
        'notes', o.notes,
        'created_at', o.created_at,
        'customer_name', cu.name,
        'customer_whatsapp', cu.whatsapp,
        'address_text', cu.address_text,
        'lat', cu.lat,
        'lng', cu.lng,
        'landmark_note', cu.landmark_note,
        'location_confirmed', cu.location_confirmed_at is not null
      ) as stop
      from orders o
      join customers cu on cu.id = o.customer_id
      where o.driver_id = me.driver_id
        and o.company_id = me.company_id
        and o.delivery_date = p_date
        and o.status <> 'cancelled'
    ) s
  ), '[]'::jsonb);
end;
$$;

-- Public: record a delivery outcome (delivered or failed) from the driver app.
-- Safe to call twice with the same p_pod_id (offline resend): the repeat is ignored.
create or replace function driver_record_outcome(
  p_token text,
  p_pod_id uuid,
  p_order_id uuid,
  p_outcome text,                       -- 'delivered' | 'failed'
  p_captured_at timestamptz,
  p_lat double precision default null,
  p_lng double precision default null,
  p_gps_accuracy_m integer default null,
  p_photo_path text default null,
  p_otp text default null,
  p_no_otp_reason text default null,
  p_recipient_name text default null,
  p_failure_reason text default null,
  p_payment_method text default null,   -- 'cash' | 'eft' | 'card' | 'none'
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
begin
  select * into me from driver_from_token(p_token);
  if not found then
    raise exception 'Driver link is not valid' using errcode = '28000';
  end if;

  if p_outcome not in ('delivered', 'failed') then
    raise exception 'Unknown outcome';
  end if;

  -- Already recorded (offline resend)?
  if exists (select 1 from proofs_of_delivery where id = p_pod_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select * into ord from orders
  where id = p_order_id and driver_id = me.driver_id and company_id = me.company_id
  for update;
  if not found then
    raise exception 'This stop is no longer assigned to you';
  end if;

  if p_photo_path is not null and p_photo_path not like me.company_id::text || '/%' then
    raise exception 'Invalid photo path';
  end if;

  if p_outcome = 'delivered' then
    if p_otp is not null and p_otp <> '' then
      otp_ok := ord.otp_code is not null and p_otp = ord.otp_code;
      if not otp_ok then
        return jsonb_build_object('ok', false, 'error', 'wrong_pin');
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
    otp_ok, nullif(trim(p_recipient_name), ''), coalesce(p_captured_at, now()), p_outcome,
    nullif(trim(p_failure_reason), ''), nullif(trim(p_no_otp_reason), '')
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
        failure_reason = nullif(trim(p_failure_reason), '')
    where id = ord.id;
  end if;

  return jsonb_build_object('ok', true, 'otp_verified', otp_ok);
end;
$$;

revoke all on function driver_whoami(text) from public;
revoke all on function driver_run(text, date) from public;
revoke all on function driver_record_outcome(text, uuid, uuid, text, timestamptz, double precision, double precision, integer, text, text, text, text, text, text, numeric) from public;
grant execute on function driver_whoami(text) to anon, authenticated;
grant execute on function driver_run(text, date) to anon, authenticated;
grant execute on function driver_record_outcome(text, uuid, uuid, text, timestamptz, double precision, double precision, integer, text, text, text, text, text, text, numeric) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private storage bucket for delivery photos. Photos are uploaded and viewed
-- only by the app server (service role), never directly by browsers.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pod-photos', 'pod-photos', false)
on conflict (id) do nothing;
