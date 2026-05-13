
-- Invoice product mappings: learned supplier↔internal name equivalencies
CREATE TABLE public.invoice_product_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  supplier_product_name TEXT NOT NULL,
  internal_product_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

-- Invoice comparisons: audit history
CREATE TABLE public.invoice_comparisons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  result_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.invoice_product_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_comparisons ENABLE ROW LEVEL SECURITY;

-- Open access policies (internal tool, no auth required)
CREATE POLICY "Allow all access to invoice_product_mappings" ON public.invoice_product_mappings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to invoice_comparisons" ON public.invoice_comparisons FOR ALL USING (true) WITH CHECK (true);

-- Unique constraint to avoid duplicate mappings
ALTER TABLE public.invoice_product_mappings ADD CONSTRAINT unique_supplier_mapping UNIQUE (supplier_name, supplier_product_name);
