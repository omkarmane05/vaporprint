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

export function usePrintQueue(shopId: string): { jobs: PrintJob[]; fetchJobs: () => Promise<void> } {
  const [jobs, setJobs] = useState<PrintJob[]>([]);

  const fetchJobs = useCallback(async () => {
    if (!shopId) return;
    const { data } = await supabase
      .from("print_jobs")
      .select("id, file_name, file_type, file_size, file_data_url, copies, code, created_at, shop_id")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });
    setJobs((data || []).map(rowToJob));
  }, [shopId]);

  useEffect(() => {
    fetchJobs();

    let destroyed = false;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const MAX_RETRIES = 5;
    const getBackoff = (attempt: number) => Math.min(1000 * 2 ** attempt, 10000);

    const subscribe = () => {
      if (destroyed) return;

      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }

      channel = supabase
        .channel(`print_jobs_${shopId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "print_jobs",
            filter: `shop_id=eq.${shopId}`,
          },
          () => {
            fetchJobs();
          }
        )
        .subscribe((status) => {
          if (destroyed) return;

          if (status === "SUBSCRIBED") {
            retryCount = 0;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            if (retryCount < MAX_RETRIES) {
              const delay = getBackoff(retryCount);
              retryCount++;
              retryTimer = setTimeout(subscribe, delay);
            }
          }
        });
    };

    subscribe();

    return () => {
      destroyed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [shopId, fetchJobs]);

  return { jobs, fetchJobs };
}
