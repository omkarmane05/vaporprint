
-- Create print_jobs table for cross-device queue sync
CREATE TABLE public.print_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_data_url TEXT NOT NULL,
  copies INTEGER NOT NULL DEFAULT 1,
  code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (customers uploading)
CREATE POLICY "Anyone can insert print jobs"
  ON public.print_jobs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Anyone can read (shop owner viewing queue by shop_id)
CREATE POLICY "Anyone can read print jobs"
  ON public.print_jobs FOR SELECT
  TO anon, authenticated
  USING (true);

-- Anyone can delete (after printing/verification)
CREATE POLICY "Anyone can delete print jobs"
  ON public.print_jobs FOR DELETE
  TO anon, authenticated
  USING (true);

-- Index for fast shop_id lookups
CREATE INDEX idx_print_jobs_shop_id ON public.print_jobs (shop_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
