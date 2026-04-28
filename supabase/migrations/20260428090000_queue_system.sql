-- =============================================
-- QUEUE SYSTEM MIGRATION
-- Adds status tracking, OTP pickup, and student auth
-- =============================================

-- Add queue columns to print_jobs
ALTER TABLE public.print_jobs
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'waiting',
ADD COLUMN IF NOT EXISTS otp TEXT,
ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES auth.users(id);

-- Index for student lookups (tracking their own jobs)
CREATE INDEX IF NOT EXISTS idx_print_jobs_student_id ON public.print_jobs (student_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON public.print_jobs (status);

-- Allow students to read their own jobs (for live tracking)
CREATE POLICY "print_jobs_select_student"
  ON public.print_jobs FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- Allow anon to also read by code (backward compat for non-logged-in tracking)
CREATE POLICY "print_jobs_select_anon_by_code"
  ON public.print_jobs FOR SELECT TO anon
  USING (true);

-- Allow shop owner to UPDATE jobs (status, otp changes)
CREATE POLICY "print_jobs_update_owner"
  ON public.print_jobs FOR UPDATE TO authenticated
  USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
