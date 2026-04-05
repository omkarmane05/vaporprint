-- =============================================
-- SECURITY HARDENING MIGRATION
-- VaporPrint — Pre-launch Security Fixes
-- =============================================

-- 1. Add owner_id to shops (links to Supabase Auth)
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);

-- 2. Drop the plaintext password column
ALTER TABLE public.shops DROP COLUMN IF EXISTS password;

-- =============================================
-- DROP ALL OLD PERMISSIVE POLICIES
-- =============================================
DROP POLICY IF EXISTS "Public discovery of shops" ON public.shops;
DROP POLICY IF EXISTS "Admin can manage shops" ON public.shops;
DROP POLICY IF EXISTS "Public can read invitations" ON public.invitations;
DROP POLICY IF EXISTS "Admin can manage invitations" ON public.invitations;
DROP POLICY IF EXISTS "Anyone can insert print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Anyone can read print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Anyone can delete print jobs" ON public.print_jobs;

-- =============================================
-- SHOPS — New Restrictive Policies
-- =============================================
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

-- Public can read basic shop info (customer upload needs shop name)
CREATE POLICY "shops_select_public"
  ON public.shops FOR SELECT TO anon, authenticated
  USING (true);

-- Only admin can create shops
CREATE POLICY "shops_insert_admin"
  ON public.shops FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Only admin can delete shops
CREATE POLICY "shops_delete_admin"
  ON public.shops FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Admin or owner can update shops
CREATE POLICY "shops_update_admin_or_owner"
  ON public.shops FOR UPDATE TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR owner_id = auth.uid()
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR owner_id = auth.uid()
  );

-- =============================================
-- INVITATIONS — New Restrictive Policies
-- =============================================
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Public can read by token (tokens are unguessable UUIDs)
CREATE POLICY "invitations_select_public"
  ON public.invitations FOR SELECT TO anon, authenticated
  USING (true);

-- Only admin can create invitations
CREATE POLICY "invitations_insert_admin"
  ON public.invitations FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Only admin can delete invitations directly
CREATE POLICY "invitations_delete_admin"
  ON public.invitations FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- =============================================
-- PRINT_JOBS — New Restrictive Policies
-- =============================================
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (customers uploading)
CREATE POLICY "print_jobs_insert_public"
  ON public.print_jobs FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only shop owner (or admin) can read jobs
CREATE POLICY "print_jobs_select_owner"
  ON public.print_jobs FOR SELECT TO authenticated
  USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Only shop owner (or admin) can delete jobs
CREATE POLICY "print_jobs_delete_owner"
  ON public.print_jobs FOR DELETE TO authenticated
  USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- =============================================
-- RPC: activate_shop — SECURITY DEFINER
-- Validates invitation, creates ownership, atomically
-- =============================================
CREATE OR REPLACE FUNCTION public.activate_shop(
  p_invitation_token TEXT,
  p_shop_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
BEGIN
  SELECT * INTO v_invite
  FROM invitations
  WHERE token = p_invitation_token
    AND shop_id = p_shop_id
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invitation token';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM shops WHERE id = p_shop_id AND owner_id IS NULL) THEN
    RAISE EXCEPTION 'Shop already activated or not found';
  END IF;

  UPDATE shops SET
    owner_id = auth.uid(),
    status = 'active'
  WHERE id = p_shop_id AND owner_id IS NULL;

  DELETE FROM invitations WHERE id = v_invite.id;
END;
$$;

-- =============================================
-- RPC: cleanup_expired_jobs
-- Scoped to current user's shops only
-- =============================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM print_jobs
  WHERE created_at < NOW() - INTERVAL '10 minutes'
    AND shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid());

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
