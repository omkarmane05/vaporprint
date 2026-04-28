-- Add payment status to print_jobs
ALTER TABLE public.print_jobs
ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10, 2) DEFAULT 0.00;

-- Update RLS: Only let the owner see jobs that are 'paid'
-- (Existing policies already let owner see all, but we will filter this in the code UI)
