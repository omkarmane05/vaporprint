import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PrintJob } from "@/lib/printQueue";

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

export function usePrintQueue(shopId: string): PrintJob[] {
  const [jobs, setJobs] = useState<PrintJob[]>([]);

  const fetchJobs = useCallback(async () => {
    if (!shopId) return;
    const { data } = await supabase
      .from("print_jobs")
      .select("id, file_name, file_type, file_size, copies, code, created_at, shop_id")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });
    setJobs((data || []).map(rowToJob));
  }, [shopId]);

  useEffect(() => {
    fetchJobs();

    // Subscribe to real-time changes for this shop
    const channel = supabase
      .channel(`print_jobs_${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "print_jobs",
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          console.log("[Realtime Alert]", payload);
          fetchJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId, fetchJobs]);

  return jobs;
}
