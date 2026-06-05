ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS credit_limit numeric,
  ADD COLUMN IF NOT EXISTS cut_day integer CHECK (cut_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS payment_day integer CHECK (payment_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS min_payment numeric,
  ADD COLUMN IF NOT EXISTS no_interest_payment numeric,
  ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT true;