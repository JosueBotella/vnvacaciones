CREATE TABLE public.invoice_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  aliases TEXT[] DEFAULT '{}',
  notes TEXT DEFAULT '',
  ai_learnings JSONB DEFAULT '[]',
  product_catalog JSONB DEFAULT '[]',
  total_comparisons INTEGER DEFAULT 0,
  last_comparison_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invoice_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to invoice_suppliers" ON public.invoice_suppliers FOR ALL USING (true) WITH CHECK (true);