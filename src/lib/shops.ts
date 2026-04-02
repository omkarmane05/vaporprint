import { supabase } from "@/integrations/supabase/client";

export interface Shop {
  id: string;
  name: string;
  location: string;
  owner_email: string;
  created_at?: string;
}

// Check if the current user is a Super Admin (Hardcoded to your email for security)
export const ADMIN_EMAIL = "omkar@vaporprint.io"; // <-- UPDATE THIS TO YOUR ACTUAL EMAIL

export async function isAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email === ADMIN_EMAIL;
}

// FOR OWNERS: Get only shops assigned to them
export async function getAssignedShops(): Promise<Shop[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return [];

  const { data, error } = await supabase
    .from("shops")
    .select("*")
    .eq("owner_email", user.email)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Shop[];
}

// FOR SUPER-ADMIN: Management functions
export async function getAllNetworkShops(): Promise<Shop[]> {
  const { data, error } = await supabase
    .from("shops")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Shop[];
}

export async function provisionShop(name: string, location: string, ownerEmail: string): Promise<void> {
  const slug = `${name}-${location}`.toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 24);
  const id = `${slug}-${Math.random().toString(36).substring(2, 6)}`;

  const { error } = await supabase.from("shops").insert({
    id,
    name,
    location,
    owner_email: ownerEmail
  });

  if (error) throw error;
}

export async function decommissionShop(id: string): Promise<void> {
  const { error } = await supabase.from("shops").delete().eq("id", id);
  if (error) throw error;
}
