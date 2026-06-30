-- Tender Tracker — Supabase schema
-- Run this once in your Supabase project's SQL Editor (Project > SQL Editor > New query)

create extension if not exists "pgcrypto";

create table if not exists tenders (
  id uuid primary key default gen_random_uuid(),
  tender_no text unique not null,
  title text not null,
  department text,
  description text,
  est_value numeric,
  status text not null default 'Request',
  request_date date,
  publish_date date,
  close_date date,
  award_date date,
  contract_signed_date date,
  winning_bidder text,
  contract_value numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bidders (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders(id) on delete cascade,
  name text not null,
  bid_amount numeric,
  submitted_date date,
  status text not null default 'Submitted',
  created_at timestamptz not null default now()
);

create table if not exists status_history (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders(id) on delete cascade,
  status text not null,
  changed_at timestamptz not null default now(),
  note text
);

-- Row Level Security
alter table tenders enable row level security;
alter table bidders enable row level security;
alter table status_history enable row level security;

-- Open policies: anyone with the anon key (i.e. anyone who has your app URL) can read/write.
-- This is fine for an internal tool on an unlisted GitHub Pages URL, but if you need real
-- access control, replace these with Supabase Auth-based policies (auth.uid() checks) later.
create policy "anon full access tenders" on tenders for all using (true) with check (true);
create policy "anon full access bidders" on bidders for all using (true) with check (true);
create policy "anon full access status_history" on status_history for all using (true) with check (true);

-- Enable realtime updates so all connected users see changes live
alter publication supabase_realtime add table tenders;
alter publication supabase_realtime add table bidders;
alter publication supabase_realtime add table status_history;
