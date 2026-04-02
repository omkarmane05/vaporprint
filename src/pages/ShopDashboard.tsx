import { useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, FileText, ShieldCheck, Printer, Copy, Trash2 } from "lucide-react";
import { usePrintQueue } from "@/hooks/usePrintQueue";
import { verifyAndPrint, removeJob } from "@/lib/printQueue";
import { toast } from "sonner";

import { useEffect, useRef } from "react";
import { Peer } from "peerjs";
import { supabase } from "@/integrations/supabase/client";

const ShopDashboard = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const jobs = usePrintQueue(shopId || "");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState("");
  const [masterOtp, setMasterOtp] = useState("");
  const masterOtpRef = useRef<HTMLInputElement>(null);
  
  // Local storage for P2P received files (not on any server!)
  const receivedFiles = useRef<Record<string, { blob: Blob; fileName: string; fileType: string }>>({});

  useEffect(() => {
    if (!shopId) return;

    // Initialize Shop Peer with solid STUN servers and lowercase ID
    const peerId = `vprint-shop-${shopId?.toLowerCase()}`;
    const peer = new Peer(peerId, {
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { 
            urls: "turn:openrelay.metered.ca:80", 
            username: "openrelay", 
            credential: "openrelay" 
          },
          { 
            urls: "turn:openrelay.metered.ca:443", 
            username: "openrelay", 
            credential: "openrelay" 
          },
        ],
      },
    });

    peer.on("open", () => {
      console.log("[P2P] Shop active on ID:", peerId);
      toast.success("Ready to receive prints (P2P Active)");
    });

    peer.on("error", (err) => {
      console.error("[P2P Server Error]", err);
      // Try to re-init if the ID was taken or server was slow
      if (err.type === "unavailable-id") toast.error("Shop ID conflict. Please refresh.");
    });

    // Relay reassembly buffer
    const chunkBuffer = new Map<string, string[]>();

    // Subscribe to Realtime Relay Channel
    const relayChannel = supabase.channel(`vprint-relay-${shopId}`)
      .on("broadcast", { event: "chunk" }, (payload: any) => {
        const { jobId, chunkIndex, totalChunks, data, fileName, fileType } = payload.payload;
        
        if (!chunkBuffer.has(jobId)) {
          chunkBuffer.set(jobId, new Array(totalChunks).fill(null));
        }
        
        const chunks = chunkBuffer.get(jobId)!;
        chunks[chunkIndex] = data;

        // If all chunks arrived, reassemble
        if (chunks.every(c => c !== null)) {
          console.log("[Relay] Reassembling file:", fileName);
          // Convert base64 chunks back to Blob
          const byteArrays = chunks.map(base64 => {
            const byteCharacters = atob(base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            return new Uint8Array(byteNumbers);
          });
          
          receivedFiles.current[jobId] = {
            blob: new Blob(byteArrays, { type: fileType }),
            fileName,
            fileType,
          };
          toast.success(`Received via Relay: ${fileName}`);
          chunkBuffer.delete(jobId);
        }
      })
      .subscribe();

    peer.on("connection", (conn) => {
      conn.on("data", (data: any) => {
        if (data.type === "FILE_TRANSFER") {
          console.log("[P2P] Received file:", data.fileName);
          // Store the binary data locally in the browser memory
          receivedFiles.current[data.jobId] = {
            blob: new Blob([data.fileData], { type: data.fileType }),
            fileName: data.fileName,
            fileType: data.fileType,
          };
          toast.success(`New file received: ${data.fileName}`);
        }
      });
    });

    return () => {
      peer.destroy();
      supabase.removeChannel(relayChannel);
    };
  }, [shopId]);

  if (!shopId) return null;

  const uploadUrl = `${window.location.origin}/upload/${shopId}`;

  const handlePrint = async (jobId: string, directCode?: string) => {
    const activeCode = directCode || inputCode;
    const job = await verifyAndPrint(shopId, jobId, activeCode);
    if (!job) {
      toast.error("Invalid verification code.");
      return;
    }

    setInputCode("");
    setVerifyingId(null);
    toast.success("Code verified! Opening print dialog...");

    // Open the document in a new window and trigger the browser print dialog
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Pop-up blocked. Please allow pop-ups and try again.");
      return;
    }

    const jobData = receivedFiles.current[jobId];
    let blob: Blob;
    let fileName = job.fileName;
    let fileType = job.fileType;

    if (jobData) {
      // Use P2P data if available (faster)
      blob = jobData.blob;
      fileName = jobData.fileName;
      fileType = jobData.fileType;
    } else {
      // Fallback to Cloud-Relay (Storage)
      toast.info("Retrieving from secure relay...");
      const { data: downloadData, error: downloadError } = await supabase.storage
        .from('vapor_buffer')
        .download(job.fileDataUrl);

      if (downloadError) {
        toast.error("Relay file expired or missing.");
        return;
      }
      blob = downloadData;

      // Vaporize from Cloud Relay immediately after download
      await supabase.storage
        .from('vapor_buffer')
        .remove([job.fileDataUrl]);
    }

    const isPdf = fileType === "application/pdf";
    const isImage = fileType.startsWith("image/");
    const blobUrl = URL.createObjectURL(blob);

    if (isPdf) {
      // For PDFs: utilize <embed> with Blob URL
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Print - ${job.fileName}</title>
          <style>
            body, html { margin:0; padding:0; height:100%; overflow:hidden; }
            embed { width:100%; height:100%; border:none; }
          </style>
        </head>
        <body>
          <embed src="${blobUrl}" type="application/pdf">
          <script>
            window.printCalled = false;
            const triggerPrint = () => {
              if (window.printCalled) return;
              window.printCalled = true;
              window.print();
            };
            
            // Try to trigger on document ready
            window.onload = () => setTimeout(triggerPrint, 800);
            
            // Fallback if onload doesn't fire (common with plugins)
            setTimeout(triggerPrint, 2500);
            
            window.addEventListener('afterprint', () => window.close());
          </script>
        </body>
        </html>
      `);
    } else if (isImage) {
      // For images: use Blob URL for display and auto-trigger print
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Print - ${job.fileName}</title>
          <style>
            @media print { body { margin: 0; } img { max-width: 100%; height: auto; page-break-inside: avoid; } }
            body { display:flex; justify-content:center; align-items:center; min-height:100vh; margin:0; background:#111; }
            img { max-width:90vw; max-height:90vh; box-shadow: 0 10px 30px rgba(0,0,0,0.4); border-radius: 8px; }
          </style>
        </head>
        <body>
          <img src="${blobUrl}" onload="setTimeout(()=>{window.print();},500)" />
          <script>
            window.addEventListener('afterprint', () => window.close());
          </script>
        </body>
        </html>
      `);
    }
    printWindow.document.close();

    // Clean up the object URL after a delay
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  };

  const handleMasterRelease = async (code: string) => {
    if (code.length !== 6) return;

    // Find the job with this code in our current queue
    const matchingJob = jobs.find(j => j.code === code);
    
    if (!matchingJob) {
      toast.error("No document found with that code in the queue.");
      setMasterOtp("");
      return;
    }

    toast.info(`Found: ${matchingJob.fileName}. Releasing...`);
    
    // Use the existing handlePrint logic with direct code passing
    await handlePrint(matchingJob.id, code);
    
    setMasterOtp("");
    masterOtpRef.current?.focus();
  };

  const copyLink = () => {
    navigator.clipboard.writeText(uploadUrl);
    toast.success("Upload link copied!");
  };

  const handleDelete = async (jobId: string) => {
    if (!shopId) return;
    try {
      await removeJob(shopId, jobId);
      delete receivedFiles.current[jobId];
      toast.success("Job vaporized from queue.");
    } catch (err) {
      toast.error("Failed to delete job.");
    }
  };

  return (
    <div className="min-h-svh bg-background p-6 md:p-12 lg:p-16 grid lg:grid-cols-[380px_1fr] gap-12 max-w-[1600px] mx-auto">
      {/* Sidebar */}
      <aside className="space-y-8">
        <div className="glass-panel p-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mb-8">
            Connect Customers
          </h2>
          <div className="bg-white p-6 rounded-[2rem] inline-block mb-6 shadow-2xl shadow-indigo-500/5">
            <QRCodeCanvas value={uploadUrl} size={240} bgColor="#fff" fgColor="#1e1e2e" />
          </div>
          <p className="text-[11px] text-muted-foreground/80 break-all font-mono mb-6 bg-secondary/50 p-3 rounded-xl border border-border/50">{uploadUrl}</p>
          <button
            onClick={copyLink}
            className="flex items-center gap-2 text-xs font-bold text-primary hover:tracking-widest transition-all"
          >
            <Copy size={14} /> COPY LINK
          </button>
        </div>

        <div className="glass-panel p-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mb-6">
            Station Status
          </h2>
          <div className="flex items-center gap-3 text-success text-sm font-bold mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-success shadow-[0_0_12px_rgba(34,197,94,0.4)]" />
            SECURE MEMORY BUFFER
          </div>
          <div className="flex items-center gap-3 text-primary text-[10px] font-bold mb-6">
             REALTIME SYNC: ACTIVE
          </div>
          <p className="text-xs text-muted-foreground/80 leading-relaxed mb-6">
            All documents stay in volatile memory and are purged automatically after 10 minutes.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-secondary/50 rounded-xl text-[10px] font-bold tracking-widest hover:bg-secondary transition-all mb-3"
          >
            REFRESH DATABASE
          </button>

          <button 
            onClick={async () => {
              const testId = crypto.randomUUID();
              try {
                await supabase.from("print_jobs").insert({
                  id: testId,
                  shop_id: shopId,
                  file_name: "DEBUG_TEST.pdf",
                  file_type: "application/pdf",
                  file_size: 1024,
                  file_data_url: "DEBUG",
                  copies: 1,
                  code: "999999"
                });
                toast.success("Debug row inserted!");
              } catch (e) {
                toast.error("DB INSERT FAILED: Check Keys!");
              }
            }}
            className="w-full py-3 bg-primary/10 rounded-xl text-[10px] font-bold tracking-widest text-primary hover:bg-primary/20 transition-all border border-primary/20"
          >
            DEBUG: TEST CONNECTION
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-8">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-16 gap-6">
          <div>
            <div className="flex items-center gap-4 mb-3">
              <div className="w-12 h-12 rounded-2xl pastel-lavender flex items-center justify-center border border-primary/20">
                <Printer className="text-primary" size={24} />
              </div>
              <h1 className="text-5xl font-extrabold tracking-tighter">Queue</h1>
            </div>
            <p className="text-muted-foreground font-light text-lg">
              Authorized Station: <span className="text-primary font-mono font-bold tracking-tight">{shopId}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold tracking-[.2em] text-muted-foreground/60 bg-white shadow-sm px-4 py-2 rounded-full border border-border">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            NETWORK LIVE
          </div>
        </header>

        {/* Master OTP Search & Release Bar */}
        <section className="mb-12">
          <div className="glass-panel p-1 border-primary/20 shadow-2xl shadow-primary/5 group transition-all hover:scale-[1.01]">
            <div className="flex flex-col sm:flex-row items-stretch gap-1">
              <div className="flex-1 flex items-center px-6 py-4 gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0 group-hover:rotate-12 transition-transform">
                  <ShieldCheck size={20} />
                </div>
                <input
                  ref={masterOtpRef}
                  type="text"
                  placeholder="ENTER 6-DIGIT CUSTOMER CODE FOR INSTANT RELEASE..."
                  maxLength={6}
                  value={masterOtp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setMasterOtp(val);
                    if (val.length === 6) {
                      // Attempt instant release when 6 digits are reached
                      handleMasterRelease(val);
                    }
                  }}
                  className="w-full bg-transparent border-none text-lg font-bold tracking-[0.2em] placeholder:tracking-normal placeholder:font-medium placeholder:text-muted-foreground/40 outline-none"
                />
              </div>
              <button 
                onClick={() => handleMasterRelease(masterOtp)}
                disabled={masterOtp.length !== 6}
                className="bg-primary text-primary-foreground px-8 py-3 rounded-2xl font-bold transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-3"
              >
                RELEASE NOW
              </button>
            </div>
          </div>
        </section>

        {/* Diagnostic Peer ID (Hidden but visible for us now) */}
        <div className="mb-4 text-[10px] font-mono text-muted-foreground/40 bg-secondary/20 px-3 py-1 rounded-md inline-block">
          Network Node ID: vprint-shop-{shopId?.toLowerCase()}
        </div>

        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
            {jobs.length === 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-32 text-center glass-panel"
              >
                <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
                  <Clock className="text-muted-foreground/40" size={32} />
                </div>
                <p className="text-muted-foreground font-medium text-lg">Waiting for scans...</p>
              </motion.div>
            )}
            {jobs.map((job) => (
              <motion.div
                key={job.id}
                layout
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -30 }}
                className="glass-panel p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 hover:shadow-2xl hover:shadow-black/[0.04]"
              >
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 rounded-2xl pastel-mint flex items-center justify-center border border-success/10 flex-shrink-0 shadow-sm">
                    <FileText className="text-primary/60" size={28} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1 tracking-tight truncate max-w-[250px]">{job.fileName}</h3>
                    <p className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider flex items-center gap-2">
                       PAGES: <span className="text-primary">{job.pageRange}</span>
                       <span className="w-1 h-1 rounded-full bg-border" />
                       {(job.fileSize / 1024).toFixed(0)} KB 
                       <span className="w-1 h-1 rounded-full bg-border" />
                       {new Date(job.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {verifyingId === job.id ? (
                    <div className="flex gap-3 items-center flex-wrap animate-in fade-in slide-in-from-right-4 duration-500">
                      <input
                        autoFocus
                        className="bg-secondary/50 border border-primary/20 rounded-xl px-6 h-14 w-40 text-center font-bold text-lg tracking-[.3em] outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all"
                        placeholder="000000"
                        maxLength={6}
                        value={inputCode}
                        onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={(e) => e.key === "Enter" && handlePrint(job.id, inputCode)}
                      />
                      <button
                        onClick={() => handlePrint(job.id, inputCode)}
                        className="bg-primary text-primary-foreground h-14 px-8 rounded-xl font-bold transition-all hover:brightness-110 active:scale-95 shadow-lg shadow-primary/20"
                      >
                        VERIFY
                      </button>
                      <button
                        onClick={() => { setVerifyingId(null); setInputCode(""); }}
                        className="h-14 w-14 rounded-xl bg-secondary flex items-center justify-center hover:bg-black/5 transition-all text-muted-foreground"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setVerifyingId(job.id)}
                        className="bg-primary text-primary-foreground h-14 px-8 rounded-xl font-bold flex items-center gap-3 transition-all hover:brightness-105 active:scale-95 shadow-lg shadow-primary/20 hover:tracking-wide"
                      >
                        <ShieldCheck size={18} /> RELEASE PRINT
                      </button>
                      <button
                        onClick={() => handleDelete(job.id)}
                        className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all active:scale-90"
                        title="Vaporize now"
                      >
                        <Trash2 size={20} />
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default ShopDashboard;
