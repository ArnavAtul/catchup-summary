ALTER TABLE public.action_items DROP CONSTRAINT IF EXISTS action_items_category_check;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.action_items ADD CONSTRAINT action_items_category_check CHECK (category IN ('updates','urgent','deadlines','decisions','mentions','events'));