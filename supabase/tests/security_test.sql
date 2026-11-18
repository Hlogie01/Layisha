-- Layisha security tests. Run with: supabase/tests/run-local.sh
-- Each check raises an exception (and stops the run) if a protection fails.

\set ON_ERROR_STOP 1
\set QUIET 1

grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;

insert into auth.users values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

-- Helper: expect a statement to fail.
create or replace function pg_temp.expect_error(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'PASS  %', label;
    return;
  end;
  raise exception 'FAIL  % (should have been blocked)', label;
end $$;

create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAIL  %', label; end if;
  raise notice 'PASS  %', label;
end $$;

grant execute on function pg_temp.expect_error(text, text) to public;
grant execute on function pg_temp.check(boolean, text) to public;

-- ---------------------------------------------------------------- setup ----
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select create_company('Company A') as a \gset
insert into drivers(company_id, name, phone) values (:'a', 'Sipho', '+27821111111') returning id as d \gset
insert into customers(company_id, name, whatsapp) values (:'a', 'Thandi Nkosi', '+27823333333') returning id as c \gset
insert into orders(company_id, reference, customer_id, items, driver_id, otp_code, amount_due)
  values (:'a', next_order_reference(:'a'), :'c', 'gas', :'d', '4321', 350) returning id as o1 \gset
insert into orders(company_id, reference, customer_id, items, driver_id, otp_code)
  values (:'a', next_order_reference(:'a'), :'c', 'water', :'d', '1111') returning id as o2 \gset
insert into driver_access_tokens(token_hash, driver_id, company_id)
  values (encode(digest('driver-secret-aaaaaaaaaaaaaaaaaaaaaaaa', 'sha256'), 'hex'), :'d', :'a');
insert into location_requests(token_hash, company_id, customer_id, order_id)
  values (encode(digest('customer-secret-bbbbbbbbbbbbbbbbbbbbbb', 'sha256'), 'hex'), :'a', :'c', :'o1');

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select create_company('Company B') as b \gset
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select create_company('Vendor C', '+27820000000', null, false, true) as v \gset

-- ------------------------------------------------- tenant isolation ----
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.check((select count(*) from orders) = 0, 'Company B cannot see Company A orders');
select pg_temp.check((select count(*) from customers) = 0, 'Company B cannot see Company A customers');
select pg_temp.check((select count(*) from audit_log) = 0, 'Company B cannot see Company A audit log');
select pg_temp.expect_error(format('insert into drivers(company_id,name,phone) values (%L,''X'',''+27820000001'')', :'a'),
  'Company B cannot add drivers to Company A');
select pg_temp.expect_error(format('select next_order_reference(%L)', :'a'), 'Company B cannot create Company A order numbers');

-- ---------------------------------------------------- account types ----
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.expect_error(format('insert into drivers(company_id,name,phone) values (%L,''X'',''+27820000002'')', :'v'),
  'Vehicle-only account cannot create delivery data');
select pg_temp.expect_error(format('update companies set is_logistics = true where id = %L', :'v'),
  'Account type cannot be changed directly');

-- --------------------------------------------------- anonymous users ----
reset role;
set role anon;
select pg_temp.expect_error('select count(*) from orders', 'Anonymous users cannot read orders');
select pg_temp.expect_error('select count(*) from customers', 'Anonymous users cannot read customers');
select pg_temp.expect_error('select rate_limit_hit(''x'', 1, 60)', 'Anonymous users cannot use the rate limiter');

-- ------------------------------------------------- customer links ----
select pg_temp.check((select count(*) from get_location_request('customer-secret-bbbbbbbbbbbbbbbbbbbbbb')) = 1,
  'Valid customer link works');
select pg_temp.check((select count(*) from get_location_request('wrong-secret-cccccccccccccccccccccccc')) = 0,
  'Wrong customer link shows nothing');
select pg_temp.expect_error('select confirm_location(''customer-secret-bbbbbbbbbbbbbbbbbbbbbb'', 51.5, -0.1)',
  'Pin outside Southern Africa rejected');
select pg_temp.check(confirm_location('customer-secret-bbbbbbbbbbbbbbbbbbbbbb', -26.0, 28.2, 'blue gate'),
  'Customer can confirm their pin');
reset role;
select pg_temp.check((select count(*) from location_requests where token_hash like 'customer-secret%') = 0,
  'Customer links are stored hashed, not in plain text');

-- ---------------------------------------------------- driver links ----
set role anon;
select pg_temp.check((select count(*) from driver_whoami('driver-secret-aaaaaaaaaaaaaaaaaaaaaaaa')) = 1,
  'Fresh driver link works');
select pg_temp.check(driver_stop_check('driver-secret-aaaaaaaaaaaaaaaaaaaaaaaa', :'o1', gen_random_uuid()) = 'ok',
  'Driver may record their own open stop');
select pg_temp.check(driver_stop_check('nope-nope-nope-nope-nope-nope-nope', :'o1', gen_random_uuid()) = 'not_yours',
  'Unknown link cannot record stops');

-- PIN lockout: 4 wrong tries say wrong_pin, the 5th locks it, then even the right PIN is refused.
select pg_temp.check((driver_record_outcome('driver-secret-aaaaaaaaaaaaaaaaaaaaaaaa', gen_random_uuid(), :'o1', 'delivered', now(),
  null, null, null, null, '0000')->>'error') = 'wrong_pin', 'Wrong PIN rejected');
select driver_record_outcome('driver-secret-aaaaaaaaaaaaaaaaaaaaaaaa', gen_random_uuid(), :'o1', 'delivered', now(), null, null, null, null, '0001');
select driver_record_outcome('driver-secret-aaaaaaaaaaaaaaaaaaaaaaaa', gen_random_uuid(), :'o1', 'delivered', now(), null, null, null, null, '0002');
select driver_record_outcome('driver-secret-aaaaaaaaaaaaaaaaaaaaaaaa', gen_random_uuid(), :'o1', 'delivered', now(), null, null, null, null, '0003');
select pg_temp.check((driver_record_outcome('driver-secret-aaaaaaaaaaaaaaaaaaaaaaaa', gen_random_uuid(), :'o1', 'delivered', now(),
  null, null, null, null, '0004')->>'error') = 'pin_locked', '5th wrong PIN locks the order');
select pg_temp.check((driver_record_outcome('driver-secret-aaaaaaaaaaaaaaaaaaaaaaaa', gen_random_uuid(), :'o1', 'delivered', now(),
  null, null, null, null, '4321')->>'error') = 'pin_locked', 'Correct PIN refused once locked');

-- Photo path must be exactly this company/order/pod.
select pg_temp.expect_error(format(
  'select driver_record_outcome(''driver-secret-aaaaaaaaaaaaaaaaaaaaaaaa'', gen_random_uuid(), %L, ''delivered'', now(), null, null, null, ''other/x.jpg'', null, ''Phone off'')', :'o2'),
  'Photo path from elsewhere rejected');

-- Normal delivery with the correct PIN, cash collected, then an offline resend is ignored.
select pg_temp.check((driver_record_outcome('driver-secret-aaaaaaaaaaaaaaaaaaaaaaaa', '99999999-9999-9999-9999-999999999999', :'o2', 'delivered', now(),
  -26.0, 28.2, 10, :'a' || '/' || :'o2' || '/99999999-9999-9999-9999-999999999999.jpg', '1111', null, 'Thandi', null, 'cash', 120)->>'ok')::boolean,
  'Correct PIN records the delivery');
select pg_temp.check((driver_record_outcome('driver-secret-aaaaaaaaaaaaaaaaaaaaaaaa', '99999999-9999-9999-9999-999999999999', :'o2', 'delivered', now(),
  null, null, null, null, '1111')->>'duplicate')::boolean, 'Offline resend of the same delivery is ignored');
select pg_temp.check(driver_stop_check('driver-secret-aaaaaaaaaaaaaaaaaaaaaaaa', :'o2', gen_random_uuid()) = 'not_yours',
  'Closed stop cannot get new photos');
reset role;
select pg_temp.check((select count(*) from payments) = 1, 'Cash collected recorded once');

-- Unused driver link older than 48 hours stops working.
update driver_access_tokens set created_at = now() - interval '49 hours', last_used_at = null
where driver_id = :'d';
set role anon;
select pg_temp.check((select count(*) from driver_whoami('driver-secret-aaaaaaaaaaaaaaaaaaaaaaaa')) = 0,
  'Unused driver link expires after 48 hours');
reset role;

-- ------------------------------------------------------- audit log ----
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.check((select count(*) from audit_log where action = 'order.pin_locked') = 1, 'PIN lock recorded in audit log');
select pg_temp.check((select count(*) from audit_log where action = 'order.created') = 2, 'Order creation recorded in audit log');
delete from audit_log;
select pg_temp.check((select count(*) from audit_log) > 0, 'Users cannot delete audit log entries');

-- ------------------------------------------------- forget customer ----
select forget_customer(:'c');
select pg_temp.check((select name from customers where id = :'c') = 'Removed customer', 'Customer details removed on request');
select pg_temp.check((select lat from customers where id = :'c') is null, 'Customer location removed on request');

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_error(format('select forget_customer(%L)', :'c'), 'Other companies cannot remove your customers');

reset role;
\echo
\echo All security tests passed.
