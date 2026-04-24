
-- Books table: each user owns their own books
create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  size bigint not null default 0,
  total_pages integer not null default 0,
  storage_path text not null,
  added_at timestamptz not null default now()
);

create index books_user_id_idx on public.books(user_id);

alter table public.books enable row level security;

create policy "Users select own books" on public.books
  for select to authenticated using (auth.uid() = user_id);
create policy "Users insert own books" on public.books
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update own books" on public.books
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own books" on public.books
  for delete to authenticated using (auth.uid() = user_id);

-- Reading progress (1 row per book per user)
create table public.reading_progress (
  book_id uuid primary key references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page integer not null default 1,
  zoom numeric not null default 1,
  updated_at timestamptz not null default now()
);

create index reading_progress_user_id_idx on public.reading_progress(user_id);

alter table public.reading_progress enable row level security;

create policy "Users select own progress" on public.reading_progress
  for select to authenticated using (auth.uid() = user_id);
create policy "Users insert own progress" on public.reading_progress
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update own progress" on public.reading_progress
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own progress" on public.reading_progress
  for delete to authenticated using (auth.uid() = user_id);

-- Storage bucket for PDFs (private)
insert into storage.buckets (id, name, public) values ('pdfs', 'pdfs', false)
  on conflict (id) do nothing;

-- Storage policies: user can only access files under their own folder (user_id/...)
create policy "Users read own pdfs" on storage.objects
  for select to authenticated
  using (bucket_id = 'pdfs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users upload own pdfs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pdfs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users delete own pdfs" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pdfs' and auth.uid()::text = (storage.foldername(name))[1]);
