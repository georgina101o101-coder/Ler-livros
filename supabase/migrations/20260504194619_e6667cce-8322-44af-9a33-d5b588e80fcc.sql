
-- highlights
CREATE TABLE IF NOT EXISTS public.highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid NOT NULL,
  page_number integer NOT NULL,
  text_selected text NOT NULL DEFAULT '',
  rectangles jsonb NOT NULL DEFAULT '[]'::jsonb,
  color text NOT NULL DEFAULT '#fde68a',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own highlights" ON public.highlights FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own highlights" ON public.highlights FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own highlights" ON public.highlights FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own highlights" ON public.highlights FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS highlights_user_book_idx ON public.highlights(user_id, book_id);

-- push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_notified_at timestamptz
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own subs" ON public.push_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own subs" ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own subs" ON public.push_subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS push_subs_user_idx ON public.push_subscriptions(user_id);

-- reading_progress: add habit-tracking fields
ALTER TABLE public.reading_progress
  ADD COLUMN IF NOT EXISTS pages_read_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz NOT NULL DEFAULT now();
