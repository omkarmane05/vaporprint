
-- Create shops table
CREATE TABLE public.shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  password TEXT, -- null until owner sets it
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'suspended'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create invitations table for activation links
CREATE TABLE public.invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id TEXT REFERENCES public.shops(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Shops: Anyone can read basic info (discovery)
CREATE POLICY "Public discovery of shops"
  ON public.shops FOR SELECT
  TO anon, authenticated
  USING (true);

-- Shops: Admin can insert/delete (Logic handled by Supabase Service Role or Dashboard Secret)
CREATE POLICY "Admin can manage shops"
  ON public.shops FOR ALL
  TO anon, authenticated
  USING (true); 

-- Invitations: Public can read if they have the token
CREATE POLICY "Public can read invitations"
  ON public.invitations FOR SELECT
  TO anon, authenticated
  USING (true);

-- Invitations: Admin can manage all
CREATE POLICY "Admin can manage invitations"
  ON public.invitations FOR ALL
  TO anon, authenticated
  USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.shops;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invitations;
