import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, ShieldCheck, Printer, Minus, Plus, Loader2, Clock, CheckCircle, IndianRupee, CreditCard } from "lucide-react";
import { addJob, generateId, generateCode, getNextTokenNumber, markPaymentDone, type PrintJob, type JobStatus } from "@/lib/printQueue";
import { supabase } from "@/integrations/supabase/client";
import { Peer } from "peerjs";
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

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

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Queue tracking state
  const [trackingJobs, setTrackingJobs] = useState<PrintJob[]>([]);
  const [isTracking, setIsTracking] = useState(false);

  // Check auth on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Poll for job status updates when tracking
  useEffect(() => {
    if (!isTracking || !user) return;
    const poll = async () => {
      const { data } = await supabase
        .from("print_jobs")
        .select("*")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false });
      if (data) {
        setTrackingJobs(data.map((row: any) => ({
          id: row.id, fileName: row.file_name, fileType: row.file_type,
          fileSize: row.file_size, fileDataUrl: row.file_data_url,
          copies: row.copies, code: row.code,
          timestamp: new Date(row.created_at).getTime(),
          shopId: row.shop_id, pageRange: row.page_range,
          colorMode: row.color_mode, duplex: row.duplex,
          layout: row.layout, status: row.status || 'waiting',
          otp: row.otp, studentId: row.student_id,
          tokenNumber: row.token_number,
          paymentStatus: row.payment_status || 'pending',
        })));
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [isTracking, user]);

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if (error) toast.error("Login failed: " + error.message);
  };

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

  const combineFiles = async () => {
    if (files.length < 2) return;
    setLoading(true);
    setStatus("Combining documents...");
    
    try {
      const mergedPdf = await PDFDocument.create();
      
      for (const pf of files) {
        const arrayBuffer = await pf.file.arrayBuffer();
        
        if (pf.file.type === "application/pdf") {
          const pdf = await PDFDocument.load(arrayBuffer);
          const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
          copiedPages.forEach(p => mergedPdf.addPage(p));
        } else if (pf.file.type.startsWith("image/")) {
          const image = pf.file.type === "image/png" 
            ? await mergedPdf.embedPng(arrayBuffer)
            : await mergedPdf.embedJpg(arrayBuffer);
          
          const page = mergedPdf.addPage([image.width, image.height]);
          page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
        }
      }
      
      const pdfBytes = await mergedPdf.save();
      const combinedFile = new File([pdfBytes], "Combined_Document.pdf", { type: "application/pdf" });
      
      // Clear current files and add the new combined one
      setFiles([]);
      await handleFiles([combinedFile]);
      toast.success("Files combined into one PDF!");
    } catch (err) {
      console.error("Combination failed:", err);
      toast.error("Failed to combine files.");
    } finally {
      setLoading(false);
      setStatus(null);
    }
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

          // Get sequential token number (McDonald's style)
          const tokenNumber = await getNextTokenNumber(safeShopId);

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
            status: 'waiting',
            studentId: user?.id,
            tokenNumber,
            paymentStatus: 'pending',
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
      if (user) setIsTracking(true); // Start tracking if logged in
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } catch (err: any) {
      console.error("[Upload Error]", err);
      setStatus(`Upload failed: ${err.message}`);
      setLoading(false);
    }
  };

  if (code) {
    const isTransferred = !loading && !status;

    // If tracking is active and jobs exist, show live tracking
    if (isTracking && trackingJobs.length > 0) {
      return (
        <div className="min-h-svh flex items-center justify-center p-6 bg-background">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center glass-panel p-12 max-w-md w-full space-y-6">
            <p className="text-muted-foreground font-medium italic text-sm">Station: {shopName || shopId}</p>
            <h2 className="text-3xl font-extrabold tracking-tight">Your Orders</h2>

            <div className="space-y-4 text-left">
              {trackingJobs.map((job) => {
                const statusConfig: Record<string, { icon: any; label: string; color: string; bg: string }> = {
                  waiting: { icon: Clock, label: job.paymentStatus === 'paid' ? "Waiting in Queue" : "Payment Pending", color: job.paymentStatus === 'paid' ? "text-amber-600" : "text-orange-600", bg: job.paymentStatus === 'paid' ? "bg-amber-50 border-amber-200" : "bg-orange-50 border-orange-300" },
                  printing: { icon: Printer, label: "Printing Now...", color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
                  ready: { icon: CheckCircle, label: "Ready for Pickup!", color: "text-green-600", bg: "bg-green-50 border-green-200" },
                  done: { icon: ShieldCheck, label: "Completed", color: "text-muted-foreground", bg: "bg-secondary border-border" },
                };
                const s = statusConfig[job.status] || statusConfig.waiting;
                const Icon = s.icon;
                const isPaid = job.paymentStatus === 'paid';
                return (
                  <motion.div key={job.id} layout className={`p-5 rounded-2xl border ${s.bg} transition-all`}>
                    <div className="flex items-center gap-4 mb-3">
                      {/* Token Number - The Big McDonald's Number */}
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl ${s.color} bg-white/80 border-2 ${s.bg.split(' ')[1] || 'border-border'} shadow-sm`}>
                        #{String(job.tokenNumber || 0).padStart(2, '0')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{job.fileName}</p>
                        <p className={`text-[10px] font-black uppercase tracking-widest ${s.color}`}>{s.label}</p>
                      </div>
                    </div>

                    {/* Payment Done Button (only for unpaid waiting jobs) */}
                    {job.status === 'waiting' && !isPaid && (
                      <motion.button
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        onClick={async () => {
                          const success = await markPaymentDone(job.id);
                          if (success) {
                            toast.success("Payment confirmed! Your order is now in the queue.");
                            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([100, 50, 100]);
                          } else {
                            toast.error("Failed to confirm payment. Try again.");
                          }
                        }}
                        className="w-full mt-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white h-14 rounded-2xl font-bold text-sm flex items-center justify-center gap-3 transition-all hover:brightness-110 active:scale-[0.98] shadow-lg shadow-green-500/20"
                      >
                        <IndianRupee size={18} />
                        I HAVE PAID
                      </motion.button>
                    )}

                    {/* Payment confirmed badge */}
                    {job.status === 'waiting' && isPaid && (
                      <div className="mt-3 flex items-center gap-2 justify-center py-2 px-4 bg-green-100 border border-green-300 rounded-xl">
                        <CreditCard size={14} className="text-green-600" />
                        <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Payment Confirmed ✓</span>
                      </div>
                    )}

                    {job.status === 'ready' && job.otp && (
                      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-3 p-4 bg-white rounded-xl border border-green-200 text-center">
                        <p className="text-[10px] uppercase tracking-[4px] font-black text-green-600 mb-1">YOUR PICKUP OTP</p>
                        <h3 className="text-4xl font-black tracking-[8px] text-green-700 font-mono">{job.otp}</h3>
                        <p className="text-[10px] text-muted-foreground mt-2">Show this OTP to the shop owner to collect your print</p>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            <p className="text-[10px] text-muted-foreground opacity-50 font-medium">Auto-refreshing • No need to wait at the shop!</p>
          </motion.div>
        </div>
      );
    }

    // Fallback: show old code screen (for non-logged-in users)
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

  // Google login gate
  if (authLoading) {
    return <div className="min-h-svh flex items-center justify-center bg-background"><Loader2 className="animate-spin text-primary" size={32} /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-svh flex items-center justify-center p-6 bg-background">
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="text-center glass-panel p-12 max-w-sm w-full space-y-8">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto pastel-lavender border border-primary/20">
            <Printer className="text-primary" size={32} />
          </div>
          <div>
            <p className="text-primary text-sm font-black uppercase tracking-[0.4em] mb-2 opacity-80">
              {isVerifying ? "Locating Hub..." : (shopName || "VaporPrint Station")}
            </p>
            <h1 className="text-3xl font-extrabold tracking-tighter italic">Sign In to Print</h1>
            <p className="text-muted-foreground text-sm mt-2 font-light">Sign in to upload documents and track your print status live.</p>
          </div>
          <button
            onClick={handleGoogleLogin}
            className="w-full bg-white border-2 border-border hover:border-primary/30 rounded-2xl h-14 font-bold text-sm flex items-center justify-center gap-3 transition-all hover:shadow-lg active:scale-95"
          >
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Continue with Google
          </button>
          <p className="text-[10px] text-muted-foreground opacity-40 uppercase tracking-widest font-bold">Privacy-First • Zero Storage</p>
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
          <p className="text-xs text-muted-foreground mt-2">Signed in as <span className="font-bold text-primary">{user.email}</span></p>
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
            {files.length > 1 && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={combineFiles}
                disabled={loading}
                className="w-full py-4 rounded-[1.5rem] bg-primary/10 border border-primary/20 text-primary font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary/20 transition-all"
              >
                <Plus size={16} /> Combine {files.length} files into one print
              </motion.button>
            )}
            
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

                    <div className="space-y-2">
                      <span className="text-[11px] uppercase tracking-widest font-black text-muted-foreground/80">Layout (Pages per Sheet)</span>
                      <div className="grid grid-cols-4 gap-2 p-1 bg-secondary/60 rounded-2xl">
                        {[1, 2, 4, 6].map((l) => (
                          <button
                            key={l}
                            onClick={() => updateConfig(pf.id, config.id, { layout: l })}
                            className={`py-2 rounded-xl text-xs font-black transition-all ${config.layout === l ? "bg-white text-primary shadow-sm border border-primary/5" : "text-muted-foreground/60 hover:text-muted-foreground"}`}
                          >
                            {l}
                          </button>
                        ))}
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
