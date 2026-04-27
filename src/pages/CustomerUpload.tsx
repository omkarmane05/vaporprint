import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, ShieldCheck, Printer, Minus, Plus, Loader2, Trash2, Copy, FilePlus, AlertCircle } from "lucide-react";
import { addJob, generateId, generateCode } from "@/lib/printQueue";
import { supabase } from "@/integrations/supabase/client";
import { Peer } from "peerjs";
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { toast } from "sonner";

// Use a more stable worker URL
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface PrintItem {
  id: string;
  file: File;
  copies: number;
  pageRange: string;
  colorMode: 'color' | 'bw';
  duplex: 'single' | 'double';
  layout: number;
  numPages: number | null;
  previews: string[];
  isPreviewLoading: boolean;
}

const CustomerUpload = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const [items, setItems] = useState<PrintItem[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
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

  const updateItemPreviews = async (itemId: string, range: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item || !item.file.type.includes("pdf")) return;

    setItems(prev => prev.map(i => i.id === itemId ? { ...i, isPreviewLoading: true } : i));
    
    try {
      const arrayBuffer = await item.file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const max = pdf.numPages;
      
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
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, previews: previewUrls, isPreviewLoading: false } : i));
    } catch (err) {
      console.error("Preview update failed:", err);
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, isPreviewLoading: false } : i));
    }
  };

  const parsePageRange = (rangeStr: string, maxPages: number): number[] => {
    if (!rangeStr || rangeStr.toLowerCase() === "all") return Array.from({ length: maxPages }, (_, i) => i + 1);
    const pages = new Set<number>();
    const parts = rangeStr.split(',').map(p => p.trim());
    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-');
        const start = Number(startStr);
        const end = Number(endStr);
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

  const handleFiles = async (newFiles: File[]) => {
    const newItems: PrintItem[] = [];
    
    for (const f of newFiles) {
      if (f.size > 50 * 1024 * 1024) {
        toast.error(`File ${f.name} too large. Max 50MB.`);
        continue;
      }

      const id = generateId();
      const isPdf = f.type === "application/pdf";
      
      const newItem: PrintItem = {
        id,
        file: f,
        copies: 1,
        pageRange: "All",
        colorMode: 'bw',
        duplex: 'single',
        layout: 1,
        numPages: null,
        previews: [],
        isPreviewLoading: false
      };

      newItems.push(newItem);
    }

    setItems(prev => [...prev, ...newItems]);

    // Process PDFs for page counts and initial previews
    for (const item of newItems) {
      if (item.file.type === "application/pdf") {
        try {
          const arrayBuffer = await item.file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          setItems(prev => prev.map(i => i.id === item.id ? { ...i, numPages: pdf.numPages } : i));
          updateItemPreviews(item.id, "All");
        } catch (err) {
          console.error("PDF analysis failed:", err);
        }
      }
    }
  };

  const duplicateItem = (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const newItem = { ...item, id: generateId() };
    setItems(prev => {
      const index = prev.findIndex(i => i.id === id);
      const updated = [...prev];
      updated.splice(index + 1, 0, newItem);
      return updated;
    });
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateItem = (id: string, updates: Partial<PrintItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };

  const handleUpload = async () => {
    if (items.length === 0) return;
    setLoading(true);
    setStatus("Generating Verification Code...");

    const verificationCode = generateCode();
    setCode(verificationCode); // Show code immediately

    try {
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        setStatus(`Processing ${index + 1}/${items.length}: ${item.file.name}`);

        let finalFile: File | Blob = item.file;
        
        // Extract pages if PDF and range is selected
        if (item.file.type === "application/pdf" && item.pageRange !== "All" && item.numPages) {
          const arrayBuffer = await item.file.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          const newPdfDoc = await PDFDocument.create();
          const pageIndices = parsePageRange(item.pageRange, item.numPages).map(p => p - 1);
          
          if (pageIndices.length > 0) {
            const copiedPages = await newPdfDoc.copyPages(pdfDoc, pageIndices);
            copiedPages.forEach(p => newPdfDoc.addPage(p));
            const pdfBytes = await newPdfDoc.save();
            finalFile = new Blob([pdfBytes], { type: "application/pdf" });
          }
        }

        const jobId = generateId();
        const safeShopId = shopId?.toLowerCase() || "unknown";
        const storagePath = `${safeShopId}/${jobId}/${item.file.name}`;

        // Step 1: Add job to DB queue
        await addJob(safeShopId, {
          id: jobId,
          fileName: item.file.name,
          fileType: item.file.type,
          fileSize: finalFile.size,
          fileDataUrl: "UPLOADING",
          copies: item.copies,
          code: verificationCode,
          timestamp: Date.now(),
          shopId: safeShopId,
          pageRange: item.pageRange === "All" ? `1-${item.numPages || 1}` : item.pageRange,
          colorMode: item.colorMode,
          duplex: item.duplex,
          layout: item.layout,
        });

        // Step 2: Upload to Storage
        setStatus(`Uploading ${index + 1}/${items.length}...`);
        const { error: uploadError } = await supabase.storage
          .from("vprint-uploads")
          .upload(storagePath, finalFile, {
            cacheControl: "600",
            upsert: true,
          });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        // Step 3: Update DB with URL
        const { data: urlData } = supabase.storage
          .from("vprint-uploads")
          .getPublicUrl(storagePath);

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
        if (!updated) throw new Error("Metadata sync failed.");

        // Step 4 (Optional): Peer & Relay
        try {
          const peer = new Peer({
            config: {
              iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
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
                fileName: item.file.name,
                fileType: item.file.type,
                fileData: finalFile
              });
              setTimeout(() => peer.destroy(), 15000);
            });
          });
          
          const channel = supabase.channel(`vprint-relay-${safeShopId}`);
          channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await channel.send({
                type: "broadcast",
                event: "file_ready",
                payload: { jobId, fileName: item.file.name, fileType: item.file.type, storageUrl: urlData.publicUrl }
              });
              setTimeout(() => supabase.removeChannel(channel), 5000);
            }
          });
        } catch { /* ignore best-effort errors */ }
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
                    animate={{ width: "100%" }}
                    transition={{ duration: 10, repeat: Infinity }}
                    className="h-full bg-primary"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground italic">Moving data to station... Keep tab open.</p>
              </div>
            ) : (
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold">Transient Session • Locked</p>
            )}
          </div>
          
          <p className="text-xs text-muted-foreground">Give this code to the station operator to release your documents.</p>
          {isTransferred && (
            <button onClick={() => window.location.reload()} className="mt-8 text-xs font-bold text-primary hover:underline">UPLOAD MORE</button>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-svh p-6 flex flex-col items-center justify-start bg-background overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl space-y-10 py-10">
        <header className="text-center">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-6 mx-auto pastel-lavender border border-primary/20">
            <Printer className="text-primary" size={28} />
          </div>
          <p className="text-primary text-sm font-black uppercase tracking-[0.4em] mb-2 opacity-80">
            {isVerifying ? "Locating Hub..." : (shopName || "VaporPrint Station")}
          </p>
          <h1 className="text-4xl font-extrabold tracking-tighter italic opacity-90">Secure Upload</h1>
        </header>

        <div className="space-y-6">
          {/* Dropzone */}
          <div 
            className={`relative group cursor-pointer transition-all duration-500 rounded-[2.5rem] border-2 border-dashed ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`} 
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} 
            onDragLeave={() => setDragOver(false)} 
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) handleFiles(Array.from(e.dataTransfer.files)); }} 
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" multiple className="hidden" aria-label="Upload documents" onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))} />
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
                <Upload className="text-muted-foreground/60" size={24} />
              </div>
              <p className="text-sm font-medium">
                <span className="text-muted-foreground font-light">Drop photos or documents here</span>
              </p>
              <p className="text-[10px] text-muted-foreground/50 mt-2 uppercase tracking-widest font-bold">PDF, JPEG, PNG • MAX 50MB</p>
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {items.map((item, index) => (
                <motion.div 
                  key={item.id} 
                  initial={{ opacity: 0, scale: 0.95, y: 20 }} 
                  animate={{ opacity: 1, scale: 1, y: 0 }} 
                  exit={{ opacity: 0, scale: 0.95, x: -20 }}
                  className="glass-panel p-0 overflow-hidden border-primary/5 hover:border-primary/20 transition-all group"
                >
                  {/* Item Header */}
                  <div className="flex items-center justify-between p-4 bg-secondary/20 border-b border-primary/5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        {index + 1}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold truncate max-w-[200px]">{item.file.name}</span>
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-black">
                          {(item.file.size / 1024).toFixed(0)} KB • {item.file.type.split('/')[1]?.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.file.type.includes("pdf") && (
                        <button 
                          onClick={() => duplicateItem(item.id)}
                          className="p-2 hover:bg-primary/10 rounded-lg text-primary transition-colors"
                          title="Add another range for this PDF"
                        >
                          <Copy size={16} />
                        </button>
                      )}
                      <button 
                        onClick={() => removeItem(item.id)}
                        className="p-2 hover:bg-destructive/10 rounded-lg text-destructive transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Page Range Logic */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Configuration</span>
                        <div className="flex items-center gap-2">
                          {item.isPreviewLoading && <Loader2 className="animate-spin text-primary" size={10} />}
                          <span className="text-[10px] font-bold text-primary">
                            {item.numPages ? `${item.numPages} Pages Detected` : item.file.type.includes("pdf") ? "Analyzing..." : "Image Document"}
                          </span>
                        </div>
                      </div>

                      {item.file.type.includes("pdf") && item.numPages && item.numPages > 1 ? (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              updateItem(item.id, { pageRange: "All" });
                              updateItemPreviews(item.id, "All");
                            }} 
                            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${item.pageRange === "All" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-secondary text-muted-foreground"}`}
                          >
                            ALL
                          </button>
                          <input 
                            type="text" 
                            placeholder="Pages (e.g. 1-3, 5)" 
                            value={item.pageRange === "All" ? "" : item.pageRange}
                            onChange={(e) => updateItem(item.id, { pageRange: e.target.value })}
                            onBlur={() => updateItemPreviews(item.id, item.pageRange)}
                            className={`flex-[3] bg-secondary/40 border border-primary/10 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 ring-primary/10 transition-all ${item.pageRange !== "All" ? "text-primary border-primary/30" : ""}`}
                            onClick={() => item.pageRange === "All" && updateItem(item.id, { pageRange: "" })}
                          />
                        </div>
                      ) : null}

                      {/* Print Settings Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <span className="text-[9px] uppercase tracking-widest font-black text-muted-foreground/60">Color</span>
                          <div className="flex p-1 bg-secondary/40 rounded-xl border border-primary/5 relative">
                            {['bw', 'color'].map((mode) => (
                              <button 
                                key={mode}
                                type="button"
                                onClick={() => updateItem(item.id, { colorMode: mode as 'color' | 'bw' })}
                                className={`relative z-10 flex-1 py-2 rounded-lg text-[10px] font-black transition-colors duration-300 ${item.colorMode === mode ? "text-primary" : "text-muted-foreground/50"}`}
                              >
                                {item.colorMode === mode && (
                                  <motion.div layoutId={`color-${item.id}`} className="absolute inset-0 bg-white shadow-sm rounded-lg -z-10 border border-primary/10" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
                                )}
                                {mode === 'bw' ? 'B&W' : 'COLOR'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[9px] uppercase tracking-widest font-black text-muted-foreground/60">Sides</span>
                          <div className="flex p-1 bg-secondary/40 rounded-xl border border-primary/5 relative">
                            {['single', 'double'].map((side) => (
                              <button 
                                key={side}
                                type="button"
                                onClick={() => updateItem(item.id, { duplex: side as 'single' | 'double' })}
                                className={`relative z-10 flex-1 py-2 rounded-lg text-[10px] font-black transition-colors duration-300 ${item.duplex === side ? "text-primary" : "text-muted-foreground/50"}`}
                              >
                                {item.duplex === side && (
                                  <motion.div layoutId={`duplex-${item.id}`} className="absolute inset-0 bg-white shadow-sm rounded-lg -z-10 border border-primary/10" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
                                )}
                                {side === 'single' ? '1-SIDE' : '2-SIDE'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Quantity & Layout */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateItem(item.id, { copies: Math.max(1, item.copies - 1) })} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold">-</button>
                          <span className="font-bold text-sm w-4 text-center">{item.copies}</span>
                          <button onClick={() => updateItem(item.id, { copies: Math.min(50, item.copies + 1) })} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold">+</button>
                          <span className="text-[9px] font-bold text-muted-foreground ml-1 uppercase tracking-tighter">Copies</span>
                        </div>
                        <div className="flex gap-1">
                          {[1, 2, 4].map((l) => (
                            <button key={l} onClick={() => updateItem(item.id, { layout: l })} className={`w-8 h-8 rounded-lg text-[10px] font-bold border transition-all ${item.layout === l ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/20 text-muted-foreground border-primary/5"}`}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Preview Thumbnails */}
                      {item.previews.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-1 pt-2 scrollbar-hide">
                          {item.previews.map((src, i) => (
                            <div key={i} className="flex-shrink-0 w-16 aspect-[3/4] rounded-md border border-primary/10 overflow-hidden bg-white shadow-sm relative">
                              <img src={src} alt="" className="w-full h-full object-cover" />
                              <div className="absolute top-0.5 left-0.5 bg-primary/80 text-[6px] text-white px-1 py-0.5 rounded font-bold">P{i+1}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {items.length > 0 && (
              <button 
                onClick={() => inputRef.current?.click()}
                className="w-full py-4 border-2 border-dashed border-primary/10 rounded-2xl flex items-center justify-center gap-3 text-primary/60 hover:bg-primary/5 hover:border-primary/20 transition-all font-bold text-sm"
              >
                <FilePlus size={18} />
                ADD MORE FILES
              </button>
            )}
          </div>

          {items.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pt-6">
              <button 
                onClick={handleUpload} 
                disabled={loading} 
                className="w-full bg-primary text-primary-foreground h-16 rounded-[1.5rem] font-bold text-lg tracking-tight transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-3 shadow-xl shadow-primary/20"
              >
                {loading ? <Loader2 className="animate-spin" size={24} /> : <ShieldCheck size={24} />}
                {loading ? (status || "VAPORIZING...") : `UPLOAD ${items.length} ITEM${items.length > 1 ? 'S' : ''}`}
              </button>
              <p className="text-[10px] text-center text-muted-foreground mt-4 italic">
                Files are encrypted in transit and vaporized immediately after release.
              </p>
            </motion.div>
          )}

          {items.length === 0 && (
            <div className="py-20 text-center space-y-4 opacity-30">
              <div className="w-20 h-20 rounded-full border-2 border-dashed border-primary/20 mx-auto flex items-center justify-center">
                <Printer size={32} className="text-primary" />
              </div>
              <p className="font-medium italic">Ready for document intake...</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default CustomerUpload;
