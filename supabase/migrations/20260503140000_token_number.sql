-- =============================================
-- TOKEN NUMBER + PAYMENT CONFIRMATION SYSTEM
-- Sequential order numbers (McDonald's style)
-- Manual payment confirmation (placeholder)
-- =============================================

-- Add token_number column (auto-incremented per shop)
ALTER TABLE public.print_jobs
ADD COLUMN IF NOT EXISTS token_number INTEGER;

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_print_jobs_token ON public.print_jobs (shop_id, token_number);

-- Function to get next token number for a shop (resets daily)
CREATE OR REPLACE FUNCTION public.get_next_token(p_shop_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_token INTEGER;
BEGIN
  SELECT COALESCE(MAX(token_number), 0) + 1
  INTO next_token
  FROM public.print_jobs
  WHERE shop_id = p_shop_id
    AND created_at >= CURRENT_DATE;
  RETURN next_token;
END;
$$;

-- Allow students to update their own job's payment_status (for "Payment Done" button)
CREATE POLICY "print_jobs_update_payment_student"
  ON public.print_jobs FOR UPDATE TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());
