import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, ShieldCheck, Printer, Minus, Plus, Loader2 } from "lucide-react";
import { addJob, generateId, generateCode } from "@/lib/printQueue";
import { supabase } from "@/integrations/supabase/client";
import { Peer } from "peerjs";
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { toast } from "sonner";

// Use a more stable worker URL
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const CustomerUpload = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [copies, setCopies] = useState(1);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [pageRange, setPageRange] = useState("All");
  const [numPages, setNumPages] = useState<number | null>(null);
  const [colorMode, setColorMode] = useState<'color' | 'bw'>('bw');
  const [duplex, setDuplex] = useState<'single' | 'double'>('single');
  const [layout, setLayout] = useState<number>(1);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchShop = async () => {
      if (!shopId) return;
      try {
        const { data, error } = await supabase
          .from("shops")
          .select("name")
          .eq("id", shopId)
          .single();
        
        if (!error && data) setShopName(data.name);
      } catch (err) {
        console.error("Shop lookup failed:", err);
      } finally {
        setIsVerifying(false);
      }
    };
    fetchShop();
  }, [shopId]);

  const updatePreviews = async (f: File, range: string, max: number) => {
    setIsPreviewLoading(true);
    try {
      const arrayBuffer = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      const selectedPages = range === "All" 
        ? Array.from({ length: Math.min(max, 3) }, (_, i) => i + 1)
        : parsePageRange(range, max).slice(0, 3); // Preview first 3 selected

      const previewUrls: string[] = [];
      for (const pageNum of selectedPages) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;
          previewUrls.push(canvas.toDataURL('image/webp', 0.6));
        }
      }
      setPreviews(previewUrls);
    } catch (err) {
      console.error("Preview update failed:", err);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const parsePageRange = (rangeStr: string, maxPages: number): number[] => {
    if (rangeStr === "All") return Array.from({ length: maxPages }, (_, i) => i + 1);
    const pages = new Set<number>();
    const parts = rangeStr.split(',').map(p => p.trim());
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.max(1, start); i <= Math.min(end, maxPages); i++) pages.add(i);
        }
      } else {
        const page = Number(part);
        if (!isNaN(page) && page >= 1 && page <= maxPages) pages.add(page);
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  };

  if (!shopId) return null;

  const handleFile = async (f: File) => {
    if (f.size > 50 * 1024 * 1024) {
      alert("File too large. Max 50MB for peer transfer.");
      return;
    }
    setFile(f);
    setPageRange("All");
    setPreviews([]);
    setNumPages(null);

    if (f.type === "application/pdf") {
      setIsPreviewLoading(true);
      setStatus("Analyzing PDF...");
      try {
        const arrayBuffer = await f.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        setNumPages(pdf.numPages);
        await updatePreviews(f, "All", pdf.numPages);
        setStatus(null);
      } catch (err) {
        console.error("PDF parsing failed:", err);
        setStatus("PDF preview failed (continuing anyway)");
      } finally {
        setIsPreviewLoading(false);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setStatus("Syncing Metadata...");

    const verificationCode = generateCode();
    const jobId = generateId();
    setCode(verificationCode); // Show code immediately

    try {
      let finalFile: File | Blob = file;
      
      // Step 0: Extract pages if PDF and range is selected
      if (file.type === "application/pdf" && pageRange !== "All" && numPages) {
        setStatus("Extracting pages...");
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const newPdfDoc = await PDFDocument.create();
        const pageIndices = parsePageRange(pageRange, numPages).map(p => p - 1);
        
        if (pageIndices.length > 0) {
          const copiedPages = await newPdfDoc.copyPages(pdfDoc, pageIndices);
          copiedPages.forEach(p => newPdfDoc.addPage(p));
          const pdfBytes = await newPdfDoc.save();
          finalFile = new Blob([pdfBytes], { type: "application/pdf" });
        }
      }

      const safeShopId = shopId.toLowerCase();
      const storagePath = `${safeShopId}/${jobId}/${file.name}`;

      // Step 1: Add job to DB queue (metadata, no file yet)
      await addJob(shopId, {
        id: jobId,
        fileName: file.name,
        fileType: file.type,
        fileSize: finalFile.size,
        fileDataUrl: "UPLOADING",
        copies,
        code: verificationCode,
        timestamp: Date.now(),
        shopId,
        pageRange: pageRange === "All" ? `1-${numPages || 1}` : pageRange,
        colorMode,
        duplex,
        layout,
      });

      // Step 2: Upload file to Supabase Storage (reliable HTTP upload)
      setStatus("Uploading document...");
      const { error: uploadError } = await supabase.storage
        .from("vprint-uploads")
        .upload(storagePath, finalFile, {
          cacheControl: "600", // 10 min cache (files are ephemeral)
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Step 3: Get public URL and update job record
      const { data: urlData } = supabase.storage
        .from("vprint-uploads")
        .getPublicUrl(storagePath);

      // Retry update if mobile network blips
      let updated = false;
      for (let i = 0; i < 3; i++) {
        const { error: updateError } = await supabase
          .from("print_jobs")
          .update({ file_data_url: urlData.publicUrl })
          .eq("id", jobId);
        
        if (!updateError) {
          updated = true;
          break;
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      if (!updated) throw new Error("Metadata sync failed. Refreshing...");

      setStatus("Document uploaded ✓");

      // Step 4 (Optional): Try P2P fast-path in background
      try {
        const peer = new Peer({
          config: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
              { urls: "turn:openrelay.metered.ca:80", username: "openrelay", credential: "openrelay" }
            ],
          }
        });

        peer.on('open', () => {
          const conn = peer.connect(`vprint-shop-${safeShopId}`);
          conn.on('open', () => {
            conn.send({
              type: "FILE_TRANSFER",
              jobId,
              fileName: file.name,
              fileType: file.type,
              fileData: file
            });
            setTimeout(() => peer.destroy(), 30000);
          });
          conn.on('error', () => { /* P2P is best-effort */ });
        });
        peer.on('error', () => { /* P2P is best-effort */ });
      } catch {
        // P2P is entirely optional — swallow errors
      }

      // Step 5 (Optional): Try Realtime broadcast notification
      try {
        const channel = supabase.channel(`vprint-relay-${safeShopId}`, {
          config: { broadcast: { self: false, ack: true } }
        });

        const subscribePromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("timeout")), 8000);
          channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timeout); reject(new Error(status)); }
          });
        });

        await subscribePromise;
        // Notify station that file is ready (lightweight signal, not the actual file)
        await channel.send({
          type: "broadcast",
          event: "file_ready",
          payload: { jobId, fileName: file.name, fileType: file.type, storageUrl: urlData.publicUrl }
        });
        setTimeout(() => supabase.removeChannel(channel), 5000);
      } catch {
        // Realtime notification is best-effort — station will pick it up via DB polling
        console.log("[Relay] Notification skipped — station will poll from DB.");
      }

      setLoading(false);
      setStatus(null);
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } catch (err: any) {
      console.error("[Upload Error]", err);
      setStatus(`Upload failed: ${err.message}`);
      setLoading(false);
    }
  };

  if (code) {
    const isTransferred = !loading && !status;
    return (
      <div className="min-h-svh flex items-center justify-center p-6 bg-background">
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center glass-panel p-16 max-w-sm w-full">
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-10 mx-auto pastel-mint border border-success/20">
            {isTransferred ? <ShieldCheck className="text-success" size={48} /> : <Loader2 className="text-primary animate-spin" size={48} />}
          </div>
          <p className="text-muted-foreground mb-4 font-medium italic">Station: {shopName || shopId}</p>
          <h2 className="text-7xl font-bold tracking-tighter text-primary mb-6">{code}</h2>
          
          <div className="mb-10">
            {!isTransferred ? (
              <div className="space-y-2">
                <p className="text-sm font-bold text-primary animate-pulse">{status}</p>
                <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: status?.includes("%") ? status.split(":")[1].trim() : "0%" }}
                    className="h-full bg-primary"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground italic">Moving data to station... Keep tab open.</p>
              </div>
            ) : (
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold">Transient Session • Locked</p>
            )}
          </div>
          
          <p className="text-xs text-muted-foreground">Give this code to the station operator to release your document.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-svh p-6 flex flex-col items-center justify-center bg-background">
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-10">
        <header className="text-center">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-6 mx-auto pastel-lavender border border-primary/20">
            <Printer className="text-primary" size={28} />
          </div>
          <p className="text-primary text-sm font-black uppercase tracking-[0.4em] mb-2 opacity-80">
            {isVerifying ? "Locating Hub..." : (shopName || "VaporPrint Station")}
          </p>
          <h1 className="text-4xl font-extrabold tracking-tighter italic opacity-90">Upload</h1>
        </header>

        <div className="space-y-6">
          <div className={`relative group cursor-pointer transition-all duration-500 rounded-[2.5rem] border-2 border-dashed ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }} onClick={() => inputRef.current?.click()}>
            <input ref={inputRef} type="file" className="hidden" aria-label="Upload document" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <div className="p-16 text-center"><div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-6"><Upload className="text-muted-foreground/60" size={24} /></div><p className="text-sm font-medium">{file ? <span className="text-primary">{file.name}</span> : <span className="text-muted-foreground font-light">Select document</span>}</p></div>
          </div>

          {file && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="glass-panel p-5 space-y-4 border-primary/10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Configuration</span>
                  <div className="flex items-center gap-2">
                    {isPreviewLoading && <Loader2 className="animate-spin text-primary" size={12} />}
                    <span className="text-xs font-bold text-primary">
                      {numPages ? `${numPages} Pages Detected` : isPreviewLoading ? "Analyzing Document..." : "Single Page"}
                    </span>
                  </div>
                </div>
                
                {(!file.type.includes("pdf") || numPages === 1) ? (
                  <div className="py-2 px-4 bg-secondary/30 rounded-xl border border-dashed border-primary/5">
                    <p className="text-[10px] text-muted-foreground font-medium italic text-center">Page selection only available for multi-page PDFs.</p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setPageRange("All")} 
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${pageRange === "All" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                    >
                      ALL
                    </button>
                    <input 
                      type="text" 
                      placeholder="e.g. 1-5, 8, 11-13" 
                      value={pageRange === "All" ? "" : pageRange}
                      onChange={(e) => setPageRange(e.target.value)}
                      onBlur={() => file && numPages && updatePreviews(file, pageRange, numPages)}
                      className={`flex-[2] bg-secondary/50 border border-primary/10 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 ring-primary/20 transition-all ${pageRange !== "All" ? "text-primary" : ""}`}
                      onClick={() => pageRange === "All" && setPageRange("")}
                    />
                  </div>
                )}

                {/* Print Strategy Controls */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">Color Mode</span>
                    <div className="flex p-1 bg-secondary/50 rounded-xl border border-primary/5 relative">
                      {['bw', 'color'].map((mode) => (
                        <button 
                          key={mode}
                          type="button"
                          onClick={() => setColorMode(mode as 'color' | 'bw')}
                          className={`relative z-10 flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors duration-300 ${colorMode === mode ? "text-primary" : "text-muted-foreground hover:text-muted-foreground/80"}`}
                        >
                          {colorMode === mode && (
                            <motion.div 
                              layoutId="colorModeBackground"
                              className="absolute inset-0 bg-white shadow-sm rounded-lg -z-10"
                              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                          )}
                          {mode === 'bw' ? 'B&W' : 'COLOR'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">Sides</span>
                    <div className="flex p-1 bg-secondary/50 rounded-xl border border-primary/5 relative">
                      {['single', 'double'].map((side) => (
                        <button 
                          key={side}
                          type="button"
                          onClick={() => setDuplex(side as 'single' | 'double')}
                          className={`relative z-10 flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors duration-300 ${duplex === side ? "text-primary" : "text-muted-foreground hover:text-muted-foreground/80"}`}
                        >
                          {duplex === side && (
                            <motion.div 
                              layoutId="duplexBackground"
                              className="absolute inset-0 bg-white shadow-sm rounded-lg -z-10"
                              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                          )}
                          {side === 'single' ? '1-SIDE' : '2-SIDE'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">Layout (Pages per sheet)</span>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 4, 6].map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setLayout(l)}
                        className={`py-2 rounded-xl text-xs font-bold transition-all border ${layout === l ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/30 text-muted-foreground border-primary/5"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {previews.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide pt-2">
                    {previews.map((src, i) => (
                      <div key={i} className="flex-shrink-0 w-24 aspect-[3/4] rounded-lg border border-primary/10 overflow-hidden bg-white shadow-sm relative">
                        <img src={src} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute top-1 left-1 bg-primary/80 text-[8px] text-white px-1.5 py-0.5 rounded-md font-bold">P{i + 1}</div>
                      </div>
                    ))}
                    {numPages && numPages > previews.length && (
                      <div className="flex-shrink-0 w-24 aspect-[3/4] rounded-lg border border-dashed border-primary/20 flex flex-col items-center justify-center bg-secondary/30 text-muted-foreground">
                        <span className="text-[10px] font-bold">+{numPages - previews.length}</span>
                        <span className="text-[8px] uppercase font-black">More</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          <div className="glass-panel p-5 flex items-center justify-between"><span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Quantity</span><div className="flex items-center gap-4"><button type="button" onClick={() => setCopies(Math.max(1, copies - 1))} className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center active:scale-90">-</button><span className="font-bold text-xl">{copies}</span><button type="button" onClick={() => setCopies(Math.min(50, copies + 1))} className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center active:scale-90">+</button></div></div>
          <button onClick={handleUpload} disabled={!file || loading} className="w-full bg-primary text-primary-foreground h-16 rounded-[1.5rem] font-bold text-base transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-3">
            {loading && <Loader2 className="animate-spin" size={20} />}
            {loading ? status : "INITIALIZE VAPOR-CORE"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default CustomerUpload;
