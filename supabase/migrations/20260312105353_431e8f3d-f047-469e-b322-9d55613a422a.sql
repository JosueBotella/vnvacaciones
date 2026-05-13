CREATE TABLE public.invoice_supplier_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.invoice_supplier_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage supplier chat" ON public.invoice_supplier_chat_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_supplier_chat_supplier ON public.invoice_supplier_chat_messages(supplier_name, created_at);