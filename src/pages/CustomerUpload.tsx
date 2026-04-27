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

interface ConfigBlock {
  id: string;
  range: string;
  colorMode: 'color' | 'bw';
  duplex: 'single' | 'double';
  layout: number;
  copies: number;
}

interface PrintFile {
  id: string;
  file: File;
  numPages: number | null;
  previews: string[];
  configs: ConfigBlock[];
}

const CustomerUpload = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const [files, setFiles] = useState<PrintFile[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
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

  const handleFiles = async (newFiles: FileList | File[]) => {
    const fileList = Array.from(newFiles);
    
    for (const f of fileList) {
      if (f.size > 100 * 1024 * 1024) {
        toast.error(`${f.name} is too large. Max 100MB.`);
        continue;
      }

      const fileId = generateId();
      const initialConfig: ConfigBlock = {
        id: generateId(),
        range: "All",
        colorMode: 'bw',
        duplex: 'single',
        layout: 1,
        copies: 1,
      };

      const newPrintFile: PrintFile = {
        id: fileId,
        file: f,
        numPages: null,
        previews: [],
        configs: [initialConfig],
      };

      setFiles(prev => [...prev, newPrintFile]);

      if (f.type === "application/pdf") {
        try {
          const arrayBuffer = await f.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          
          // Generate previews for the initial config
          const previewUrls = await generatePreviews(f, "All", pdf.numPages);
          
          setFiles(prev => prev.map(pf => 
            pf.id === fileId 
              ? { ...pf, numPages: pdf.numPages, previews: previewUrls } 
              : pf
          ));
        } catch (err) {
          console.error("PDF parsing failed:", err);
        }
      }
    }
  };

  const generatePreviews = async (f: File, range: string, max: number): Promise<string[]> => {
    try {
      const arrayBuffer = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      const selectedPages = range === "All" 
        ? Array.from({ length: Math.min(max, 3) }, (_, i) => i + 1)
        : parsePageRange(range, max).slice(0, 3);

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
      return previewUrls;
    } catch (err) {
      console.error("Preview generation failed:", err);
      return [];
    }
  };

  const addRange = (fileId: string) => {
    setFiles(prev => prev.map(f => {
      if (f.id === fileId) {
        return {
          ...f,
          configs: [
            ...f.configs,
            {
              id: generateId(),
              range: "",
              colorMode: 'bw',
              duplex: 'single',
              layout: 1,
              copies: 1,
            }
          ]
        };
      }
      return f;
    }));
  };

  const removeRange = (fileId: string, configId: string) => {
    setFiles(prev => prev.map(f => {
      if (f.id === fileId && f.configs.length > 1) {
        return {
          ...f,
          configs: f.configs.filter(c => c.id !== configId)
        };
      }
      return f;
    }));
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const updateConfig = async (fileId: string, configId: string, updates: Partial<ConfigBlock>) => {
    setFiles(prev => prev.map(f => {
      if (f.id === fileId) {
        const updatedConfigs = f.configs.map(c => 
          c.id === configId ? { ...c, ...updates } : c
        );
        return { ...f, configs: updatedConfigs };
      }
      return f;
    }));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setLoading(true);
    
    const verificationCode = generateCode();
    setCode(verificationCode);

    try {
      for (const printFile of files) {
        setStatus(`Processing ${printFile.file.name}...`);
        
        for (const config of printFile.configs) {
          const jobId = generateId();
          let finalFile: File | Blob = printFile.file;

          // Step 0: Extract pages if PDF and range is selected
          if (printFile.file.type === "application/pdf" && config.range !== "All" && printFile.numPages) {
            setStatus(`Extracting pages for ${printFile.file.name} (${config.range})...`);
            const arrayBuffer = await printFile.file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const newPdfDoc = await PDFDocument.create();
            const pageIndices = parsePageRange(config.range, printFile.numPages).map(p => p - 1);
            
            if (pageIndices.length > 0) {
              const copiedPages = await newPdfDoc.copyPages(pdfDoc, pageIndices);
              copiedPages.forEach(p => newPdfDoc.addPage(p));
              const pdfBytes = await newPdfDoc.save();
              finalFile = new Blob([pdfBytes], { type: "application/pdf" });
            }
          }

          const safeShopId = shopId?.toLowerCase() || "";
          const storagePath = `${safeShopId}/${jobId}/${printFile.file.name}`;

          // Step 1: Add job to DB queue
          await addJob(safeShopId, {
            id: jobId,
            fileName: printFile.file.name,
            fileType: printFile.file.type,
            fileSize: finalFile.size,
            fileDataUrl: "UPLOADING",
            copies: config.copies,
            code: verificationCode,
            timestamp: Date.now(),
            shopId: safeShopId,
            pageRange: config.range === "All" ? `1-${printFile.numPages || 1}` : config.range,
            colorMode: config.colorMode,
            duplex: config.duplex,
            layout: config.layout,
          });

          // Step 2: Upload to Supabase Storage
          setStatus(`Uploading ${printFile.file.name}...`);
          const { error: uploadError } = await supabase.storage
            .from("vprint-uploads")
            .upload(storagePath, finalFile, {
              cacheControl: "600",
              upsert: true,
            });

          if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

          // Step 3: Update job record with Public URL
          const { data: urlData } = supabase.storage
            .from("vprint-uploads")
            .getPublicUrl(storagePath);

          await supabase
            .from("print_jobs")
            .update({ file_data_url: urlData.publicUrl })
            .eq("id", jobId);

          // Step 4 (Optional): PeerJS Transfer (Best effort)
          try {
            const peer = new Peer({
              config: {
                iceServers: [
                  { urls: "stun:stun.l.google.com:19302" },
                  { urls: "stun:stun1.l.google.com:19302" },
                ],
              }
            });
            peer.on('open', () => {
              const conn = peer.connect(`vprint-shop-${safeShopId}`);
              conn.on('open', () => {
                conn.send({
                  type: "FILE_TRANSFER",
                  jobId,
                  fileName: printFile.file.name,
                  fileType: printFile.file.type,
                  fileData: finalFile
                });
                setTimeout(() => peer.destroy(), 15000);
              });
            });
          } catch { /* Ignore */ }
        }
      }

      setStatus("All documents uploaded ✓");
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
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold">Order Received ✓</p>
            )}
          </div>
          
          <p className="text-xs text-muted-foreground">Give this code to the station operator to release your documents.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-svh p-6 flex flex-col items-center justify-start bg-background">
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl space-y-10">
        <header className="text-center pt-8">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-6 mx-auto pastel-lavender border border-primary/20">
            <Printer className="text-primary" size={28} />
          </div>
          <p className="text-primary text-sm font-black uppercase tracking-[0.4em] mb-2 opacity-80">
            {isVerifying ? "Locating Hub..." : (shopName || "VaporPrint Station")}
          </p>
          <h1 className="text-4xl font-extrabold tracking-tighter italic opacity-90">Upload Center</h1>
        </header>

        <div className="space-y-6">
          <div 
            className={`relative group cursor-pointer transition-all duration-500 rounded-[2.5rem] border-2 border-dashed ${dragOver ? "border-primary bg-primary/5 scale-95" : "border-border hover:border-primary/30"}`} 
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} 
            onDragLeave={() => setDragOver(false)} 
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); }} 
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" multiple className="hidden" aria-label="Upload documents" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-6">
                <Upload className="text-muted-foreground/60" size={24} />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                <span className="text-primary font-bold">Click or drop</span> documents here<br/>
                <span className="text-[10px] uppercase tracking-widest opacity-60">Multiple files supported</span>
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {files.map((pf) => (
              <motion.div key={pf.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="glass-panel p-6 space-y-6 relative border-primary/5">
                <button onClick={() => removeFile(pf.id)} className="absolute top-4 right-4 text-muted-foreground/40 hover:text-destructive transition-colors">
                  <Plus className="rotate-45" size={20} />
                </button>

                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary">
                    <Printer size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg truncate max-w-[200px] sm:max-w-[300px]">{pf.file.name}</h3>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                      {pf.numPages ? `${pf.numPages} Pages` : "Single Page"} • {(pf.file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                </div>

                {pf.configs.map((config, idx) => (
                  <div key={config.id} className="bg-secondary/20 p-5 rounded-3xl space-y-4 border border-primary/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase tracking-widest font-black text-primary/60">Instruction {pf.configs.length > 1 ? `#${idx + 1}` : ""}</span>
                      {pf.configs.length > 1 && (
                        <button onClick={() => removeRange(pf.id, config.id)} className="text-[10px] font-bold text-destructive hover:underline uppercase">Remove</button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {pf.file.type === "application/pdf" && pf.numPages && pf.numPages > 1 ? (
                        <div className="space-y-2">
                          <span className="text-[11px] uppercase tracking-widest font-black text-muted-foreground/80">Page Range</span>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => updateConfig(pf.id, config.id, { range: "All" })} 
                              className={`px-4 py-3 rounded-xl text-[10px] font-black transition-all ${config.range === "All" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/10" : "bg-secondary text-muted-foreground"}`}
                            >
                              ALL
                            </button>
                            <input 
                              type="text" 
                              placeholder="e.g. 1-3" 
                              value={config.range === "All" ? "" : config.range}
                              onChange={(e) => updateConfig(pf.id, config.id, { range: e.target.value })}
                              className={`flex-1 bg-secondary/60 border-2 border-primary/5 rounded-xl px-4 py-3 text-sm font-black outline-none focus:ring-4 ring-primary/5 transition-all ${config.range !== "All" ? "text-primary border-primary/20" : ""}`}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <span className="text-[11px] uppercase tracking-widest font-black text-muted-foreground/80 opacity-40">Page Selection</span>
                          <div className="py-3 px-4 bg-secondary/40 rounded-xl border border-dashed border-primary/5">
                            <p className="text-[10px] text-muted-foreground font-medium italic">Available for multi-page PDFs.</p>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <span className="text-[11px] uppercase tracking-widest font-black text-muted-foreground/80">Copies</span>
                        <div className="flex items-center gap-3">
                          <button onClick={() => updateConfig(pf.id, config.id, { copies: Math.max(1, config.copies - 1) })} className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center active:scale-90">-</button>
                          <span className="font-bold text-lg min-w-[20px] text-center">{config.copies}</span>
                          <button onClick={() => updateConfig(pf.id, config.id, { copies: config.copies + 1 })} className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center active:scale-90">+</button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <span className="text-[11px] uppercase tracking-widest font-black text-muted-foreground/80">Color Mode</span>
                        <div className="flex p-1 bg-secondary/60 rounded-2xl relative">
                          {['bw', 'color'].map((mode) => (
                            <button 
                              key={mode}
                              onClick={() => updateConfig(pf.id, config.id, { colorMode: mode as 'bw' | 'color' })}
                              className={`relative z-10 flex-1 py-2.5 rounded-xl text-[10px] font-black transition-colors ${config.colorMode === mode ? "text-primary" : "text-muted-foreground/60"}`}
                            >
                              {config.colorMode === mode && (
                                <motion.div layoutId={`color-${config.id}`} className="absolute inset-0 bg-white shadow-sm rounded-xl -z-10" />
                              )}
                              {mode === 'bw' ? 'B&W' : 'COLOR'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-[11px] uppercase tracking-widest font-black text-muted-foreground/80">Sides</span>
                        <div className="flex p-1 bg-secondary/60 rounded-2xl relative">
                          {['single', 'double'].map((side) => (
                            <button 
                              key={side}
                              onClick={() => updateConfig(pf.id, config.id, { duplex: side as 'single' | 'double' })}
                              className={`relative z-10 flex-1 py-2.5 rounded-xl text-[10px] font-black transition-colors ${config.duplex === side ? "text-primary" : "text-muted-foreground/60"}`}
                            >
                              {config.duplex === side && (
                                <motion.div layoutId={`duplex-${config.id}`} className="absolute inset-0 bg-white shadow-sm rounded-xl -z-10" />
                              )}
                              {side === 'single' ? '1-SIDE' : '2-SIDE'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {idx === pf.configs.length - 1 && pf.numPages && pf.numPages > 1 && (
                      <button 
                        onClick={() => addRange(pf.id)}
                        className="w-full py-3 mt-2 rounded-xl border-2 border-dashed border-primary/10 text-[10px] font-black text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                      >
                        <Plus size={14} /> Add Another Range
                      </button>
                    )}
                  </div>
                ))}

                {pf.previews.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {pf.previews.map((src, i) => (
                      <div key={i} className="flex-shrink-0 w-20 aspect-[3/4] rounded-xl border border-primary/10 overflow-hidden bg-white shadow-sm relative">
                        <img src={src} alt={`Page ${i + 1}`} className="w-full h-full object-contain" />
                        <div className="absolute top-1 left-1 bg-primary/80 text-[8px] text-white px-1.5 py-0.5 rounded-md font-bold">P{i + 1}</div>
                      </div>
                    ))}
                    {pf.numPages && pf.numPages > pf.previews.length && (
                      <div className="flex-shrink-0 w-20 aspect-[3/4] rounded-xl border border-dashed border-primary/10 flex flex-col items-center justify-center bg-secondary/20 text-muted-foreground">
                        <span className="text-[10px] font-bold">+{pf.numPages - pf.previews.length}</span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          <button 
            onClick={handleUpload} 
            disabled={files.length === 0 || loading} 
            className="w-full bg-primary text-primary-foreground h-16 rounded-[2rem] font-bold text-lg tracking-tight transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-3 shadow-xl shadow-primary/20"
          >
            {loading ? <Loader2 className="animate-spin" size={24} /> : <ShieldCheck size={24} />}
            {loading ? (status || "Uploading...") : "SECURE UPLOAD"}
          </button>
          
          <p className="text-[10px] text-center text-muted-foreground uppercase tracking-[0.3em] font-bold opacity-40 pb-10">
            Ephemeral P2P Tunneling Active
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default CustomerUpload;
