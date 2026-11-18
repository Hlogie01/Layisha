-- Minimal stand-ins for the parts of Supabase the migrations rely on, so the
-- migrations and security tests can run on a plain local Postgres.
-- Never run this against a real Supabase project.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$ begin
  create role anon;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role bypassrls;
exception when duplicate_object then null; end $$;

grant usage on schema public, auth to anon, authenticated, service_role;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean);
