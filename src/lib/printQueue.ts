import { supabase } from "@/integrations/supabase/client";

export type JobStatus = 'waiting' | 'printing' | 'ready' | 'done';
export type PaymentStatus = 'pending' | 'paid';

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
  pageRange?: string;
  colorMode?: 'color' | 'bw';
  duplex?: 'single' | 'double';
  layout?: number; // pages per sheet
  status: JobStatus;
  otp?: string;
  studentId?: string;
  tokenNumber?: number;
  paymentStatus: PaymentStatus;
}

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
    pageRange: row.page_range,
    colorMode: row.color_mode,
    duplex: row.duplex,
    layout: row.layout,
    status: row.status || 'waiting',
    otp: row.otp,
    studentId: row.student_id,
    tokenNumber: row.token_number,
    paymentStatus: row.payment_status || 'pending',
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

// Get the next sequential token number for a shop (resets daily)
export async function getNextTokenNumber(shopId: string): Promise<number> {
  const { data, error } = await supabase.rpc("get_next_token", { p_shop_id: shopId });
  if (error || !data) {
    // Fallback: generate a random 2-digit number if RPC fails
    return Math.floor(Math.random() * 99) + 1;
  }
  return data as number;
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
    page_range: job.pageRange,
    color_mode: job.colorMode,
    duplex: job.duplex,
    layout: job.layout,
    status: job.status || 'waiting',
    student_id: job.studentId || null,
    token_number: job.tokenNumber || null,
    payment_status: job.paymentStatus || 'pending',
  });
  if (error) {
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

  // Vaporize Job Metadata from DB (File data was never stored on server)
  await supabase.from("print_jobs").delete().eq("id", jobId);

  return job;
}

// --- Queue System Functions ---

export function generatePickupOTP(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function updateJobStatus(shopId: string, jobId: string, status: JobStatus, otp?: string) {
  const updates: Record<string, any> = { status };
  if (otp) updates.otp = otp;
  
  const { error } = await supabase
    .from("print_jobs")
    .update(updates)
    .eq("id", jobId)
    .eq("shop_id", shopId);
  
  if (error) throw error;
}

export async function verifyPickupOTP(shopId: string, otp: string): Promise<PrintJob | null> {
  const { data, error } = await supabase
    .from("print_jobs")
    .select("*")
    .eq("shop_id", shopId)
    .eq("status", "ready")
    .eq("otp", otp)
    .single();

  if (error || !data) return null;

  const job = rowToJob(data);

  // Vaporize after successful pickup
  await supabase.from("print_jobs").delete().eq("id", data.id);

  return job;
}

export async function getStudentJobs(studentId: string): Promise<PrintJob[]> {
  const { data, error } = await supabase
    .from("print_jobs")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data || []).map(rowToJob);
}

// --- Payment Functions ---

export async function markPaymentDone(jobId: string): Promise<boolean> {
  const { error } = await supabase
    .from("print_jobs")
    .update({ payment_status: 'paid' })
    .eq("id", jobId);

  return !error;
}

// NOTE: Auto-expiry is now handled by the cleanup_expired_jobs RPC
// called from ShopDashboard (authenticated, scoped to owner's shops).
// No more global setInterval running on every page load.
