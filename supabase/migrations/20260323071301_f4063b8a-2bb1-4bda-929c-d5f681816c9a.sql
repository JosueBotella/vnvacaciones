-- Create incidencias_losses table for tracking economic losses per worker
CREATE TABLE public.incidencias_losses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES public.incidencias_records(id) ON DELETE CASCADE,
  worker_id uuid,
  importe numeric NOT NULL DEFAULT 0,
  motivo text,
  consecuencia text,
  ticket_id text,
  claim_id text,
  origen text NOT NULL DEFAULT 'csv_import',
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add importe_total column to incidencias_records
ALTER TABLE public.incidencias_records ADD COLUMN IF NOT EXISTS importe_total numeric DEFAULT 0;

-- Index for fast lookups
CREATE INDEX idx_incidencias_losses_worker_id ON public.incidencias_losses(worker_id);
CREATE INDEX idx_incidencias_losses_record_id ON public.incidencias_losses(record_id);
CREATE INDEX idx_incidencias_losses_fecha ON public.incidencias_losses(fecha);

-- Enable RLS
ALTER TABLE public.incidencias_losses ENABLE ROW LEVEL SECURITY;

-- RLS policy: allow service role (edge functions) full access
CREATE POLICY "Service role full access" ON public.incidencias_losses
  FOR ALL USING (true) WITH CHECK (true);