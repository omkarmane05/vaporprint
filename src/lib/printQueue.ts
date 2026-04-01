import { supabase } from "@/integrations/supabase/client";

export interface PrintJob {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileDataUrl: string;
  copies: number;
  code: string;
  timestamp: number;
  shopId: string;
}

// Map DB row to our PrintJob interface
function rowToJob(row: any): PrintJob {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    fileDataUrl: row.file_data_url,
    copies: row.copies,
    code: row.code,
    timestamp: new Date(row.created_at).getTime(),
    shopId: row.shop_id,
  };
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function generateShopId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function addJob(shopId: string, job: PrintJob) {
  const { error } = await supabase.from("print_jobs").insert({
    id: job.id,
    shop_id: shopId,
    file_name: job.fileName,
    file_type: job.fileType,
    file_size: job.fileSize,
    file_data_url: job.fileDataUrl,
    copies: job.copies,
    code: job.code,
  });
  if (error) {
    console.error("[VaporPrint] Failed to add job:", error.message);
    throw error;
  }
}

export async function getQueue(shopId: string): Promise<PrintJob[]> {
  const { data, error } = await supabase
    .from("print_jobs")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[VaporPrint] Failed to fetch queue:", error.message);
    return [];
  }
  return (data || []).map(rowToJob);
}

export async function removeJob(shopId: string, jobId: string) {
  await supabase.from("print_jobs").delete().eq("id", jobId).eq("shop_id", shopId);
}

export async function verifyAndPrint(shopId: string, jobId: string, code: string): Promise<PrintJob | null> {
  const { data, error } = await supabase
    .from("print_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("shop_id", shopId)
    .single();

  if (error || !data || data.code !== code) return null;

  const job = rowToJob(data);

  // Vaporize Job Metadata from DB (File data was never stored on server!)
  await supabase.from("print_jobs").delete().eq("id", jobId);

  return job;
}

// Auto-expire jobs metadata older than 10 minutes
setInterval(async () => {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  
  // Fetch expired jobs to get their IDs
  const { data } = await supabase
    .from("print_jobs")
    .select("id")
    .lt("created_at", tenMinAgo);

  if (data && data.length > 0) {
    const ids = data.map(j => j.id);
    console.log(`[VaporPrint] 🗑️ Vaporizing ${data.length} expired job metadata entries`);
    await supabase.from("print_jobs").delete().in("id", ids);
  }
}, 30000);
