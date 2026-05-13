-- Add new state to justificante_estado enum for when documentation is requested
ALTER TYPE justificante_estado ADD VALUE IF NOT EXISTS 'pendiente_docs';