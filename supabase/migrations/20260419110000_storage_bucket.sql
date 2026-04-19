-- =============================================
-- STORAGE BUCKET: vprint-uploads
-- Temporary file storage for print jobs
-- Files auto-expire via cleanup_expired_jobs
-- =============================================

-- Create the bucket (public read so stations can download without auth)
INSERT INTO storage.buckets (id, name, public)
VALUES ('vprint-uploads', 'vprint-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can upload files (customers are anonymous)
CREATE POLICY "vprint_uploads_insert_public"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'vprint-uploads');

-- Public read access (station downloads files by URL)
CREATE POLICY "vprint_uploads_select_public"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'vprint-uploads');

-- Only authenticated users (shop owners/admin) can delete
CREATE POLICY "vprint_uploads_delete_auth"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vprint-uploads');

-- =============================================
-- Allow customers to update file_data_url after upload
-- =============================================
CREATE POLICY "print_jobs_update_file_url"
  ON public.print_jobs FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);
