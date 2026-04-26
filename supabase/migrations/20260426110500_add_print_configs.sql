ALTER TABLE public.print_jobs 
ADD COLUMN color_mode TEXT DEFAULT 'bw',
ADD COLUMN duplex TEXT DEFAULT 'single',
ADD COLUMN layout INTEGER DEFAULT 1;
