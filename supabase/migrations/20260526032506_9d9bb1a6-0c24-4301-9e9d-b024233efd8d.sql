
-- Tarjetas de crédito
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank TEXT NOT NULL,
  alias TEXT NOT NULL,
  last4 TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_cards" ON public.cards FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Personas a quienes presto la tarjeta
CREATE TABLE public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  color TEXT NOT NULL DEFAULT '#10b981',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_people" ON public.people FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Estados de cuenta (PDFs subidos)
CREATE TABLE public.statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  pdf_path TEXT,
  parsed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (card_id, period)
);
ALTER TABLE public.statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_statements" ON public.statements FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Compras extraídas del estado de cuenta
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  statement_id UUID NOT NULL REFERENCES public.statements(id) ON DELETE CASCADE,
  posted_at DATE,
  merchant TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  installment_amount NUMERIC(12,2) NOT NULL,
  current_installment INT NOT NULL DEFAULT 1,
  total_installments INT NOT NULL DEFAULT 1,
  signature TEXT NOT NULL,
  assignment_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_purchases" ON public.purchases FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_purchases_signature ON public.purchases (card_id, signature);
CREATE INDEX idx_purchases_statement ON public.purchases (statement_id);

-- Asignaciones (permite split entre varias personas)
CREATE TABLE public.purchase_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  share_amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_assignments" ON public.purchase_assignments FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_assignments_purchase ON public.purchase_assignments (purchase_id);

-- Reglas aprendidas para auto-asignar recurrentes el siguiente mes
CREATE TABLE public.merchant_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  signature TEXT NOT NULL,
  assignments JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (card_id, signature)
);
ALTER TABLE public.merchant_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_rules" ON public.merchant_rules FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Bucket para los PDFs (privado)
INSERT INTO storage.buckets (id, name, public) VALUES ('statements', 'statements', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "users_read_own_statements" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'statements' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users_upload_own_statements" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'statements' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users_delete_own_statements" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'statements' AND auth.uid()::text = (storage.foldername(name))[1]);
