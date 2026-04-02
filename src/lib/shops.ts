import { supabase } from "@/integrations/supabase/client";

export interface Shop {
  id: string;
  name: string;
  location: string;
  owner_email: string;
}

export async function getAssignedShops(): Promise<Shop[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return [];

  const { data, error } = await supabase
    .from("shops")
    .select("*")
    .eq("owner_email", user.email)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Shops] Failed to fetch assigned branches:", error.message);
    return [];
  }
  return data as Shop[];
}
