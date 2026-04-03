
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, FileText, ShieldCheck, Printer, Copy, Trash2, Lock, Shield, Sparkles, Loader2, Radio } from "lucide-react";
import { usePrintQueue } from "@/hooks/usePrintQueue";
import { verifyAndPrint, removeJob } from "@/lib/printQueue";
import { toast } from "sonner";
import { Peer } from "peerjs";
import { supabase } from "@/integrations/supabase/client";

const ShopDashboard = () => {
  const navigate = useNavigate();
  const { shopId } = useParams<{ shopId: string }>();
  const jobs = usePrintQueue(shopId || "");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState("");
  const [masterOtp, setMasterOtp] = useState("");
  const masterOtpRef = useRef<HTMLInputElement>(null);
  
  // SaaS Security States
  const [isVerifyingShop, setIsVerifyingShop] = useState(true);
  const [shopData, setShopData] = useState<{ name: string; status: string; password?: string } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const receivedFiles = useRef<Record<string, { blob: Blob; fileName: string; fileType: string }>>({});

  useEffect(() => {
    const checkShop = async () => {
      if (!shopId) return;

      try {
        const { data, error } = await supabase
          .from("shops")
          .select("name, status, password")
          .eq("id", shopId)
          .single();

        if (error || !data) {
          setIsVerifyingShop(false);
          return;
        }

        setShopData(data);
        
        // Check if session exists in local storage
        const savedSession = localStorage.getItem(`vprint_session_${shopId}`);
        if (savedSession === data.password) {
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.error("[Shop Check Error]", err);
      } finally {
        setIsVerifyingShop(false);
      }
    };

    checkShop();
  }, [shopId]);

  useEffect(() => {
    if (!shopId || !isAuthenticated) return;

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
        ],
      },
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
          const byteArrays = chunks.map(base64 => {
            const byteCharacters = atob(base64);
            const byteNumbers = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            return byteNumbers;
          });
          
          receivedFiles.current[jobId] = {
            blob: new Blob(byteArrays, { type: fileType }),
            fileName,
            fileType,
          };
          toast.success(`Received: ${fileName}`);
          chunkBuffer.delete(jobId);
        }
      })
      .subscribe();

    peer.on("connection", (conn) => {
      conn.on("data", (data: any) => {
        if (data.type === "FILE_TRANSFER") {
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
  }, [shopId, isAuthenticated]);

  const handlePrint = async (jobId: string, directCode?: string) => {
    const activeCode = directCode || inputCode;
    
    // Open a blank tab IMMEDIATELY to avoid popup blockers
    // Web browsers only allow window.open if it is directly triggered by a user click
    const printWindow = window.open("about:blank", "_blank");
    if (!printWindow) {
      toast.error("Popup blocked! Please allow popups for this station.");
      return;
    }

    // Now do the database verification (async)
    const job = await verifyAndPrint(shopId || "", jobId, activeCode);
    
    if (!job) {
      printWindow.close();
      toast.error("Invalid verification code.");
      return;
    }

    const jobData = receivedFiles.current[jobId];
    if (jobData && jobData.blob && jobData.blob.size > 0) {
      const url = URL.createObjectURL(jobData.blob);
      printWindow.location.href = url;
      toast.success(`Released: ${jobData.fileName}`);
    } else {
      printWindow.close();
      toast.error("File data missing or empty. Please have customer re-upload.");
    }

    setInputCode("");
    setVerifyingId(null);
  };

  const handleMasterRelease = async (code: string) => {
    if (code.length !== 6) return;
    const matchingJob = jobs.find(j => j.code === code);
    if (!matchingJob) {
      toast.error("Code not found in queue.");
      setMasterOtp("");
      return;
    }
    await handlePrint(matchingJob.id, code);
    setMasterOtp("");
  };

  const handleLogin = async () => {
    if (!shopData || !shopId) return;
    setIsLoggingIn(true);
    await new Promise(r => setTimeout(r, 600));
    if (loginPassword === shopData.password) {
      setIsAuthenticated(true);
      localStorage.setItem(`vprint_session_${shopId}`, loginPassword);
      toast.success(`Station Unlocked`);
    } else {
      toast.error("Incorrect password.");
    }
    setIsLoggingIn(false);
  };

  if (isVerifyingShop) return <div className="min-h-svh flex items-center justify-center bg-background"><Loader2 className="animate-spin text-primary" size={32} /></div>;
  if (!shopData) return <div className="min-h-svh flex flex-col items-center justify-center p-6"><h1 className="text-4xl font-extrabold opacity-20 italic">VaporPrint</h1><p className="text-muted-foreground mt-4">Station ID Not Found</p></div>;

  if (!isAuthenticated && shopData.status === "active") {
    return (
      <div className="min-h-svh flex items-center justify-center p-6 bg-background">
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md glass-panel p-10 text-center space-y-10">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto"><Lock className="text-primary" size={24} /></div>
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight italic">{shopData.name}</h1>
            <p className="text-muted-foreground text-sm font-light">Station Secured • Enter Password</p>
          </div>
          <input type="password" placeholder="Station Password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} className="w-full bg-secondary/50 border border-primary/10 rounded-2xl px-6 h-14 font-bold text-lg text-center outline-none focus:ring-4 ring-primary/5 transition-all" autoFocus />
          <button onClick={handleLogin} disabled={isLoggingIn || !loginPassword} className="w-full bg-primary text-primary-foreground h-14 rounded-2xl font-bold transition-all hover:brightness-105 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-30">
            {isLoggingIn ? <Loader2 className="animate-spin" size={20} /> : <Shield size={20} />}
            {isLoggingIn ? "UNLOCKING..." : "UNLOCK STATION"}
          </button>
        </motion.div>
      </div>
    );
  }

  const uploadUrl = `${window.location.origin}/upload/${shopId}`;

  return (
    <div className="min-h-svh bg-background p-6 md:p-12 lg:p-16 grid lg:grid-cols-[380px_1fr] gap-12 max-w-[1600px] mx-auto">
      <aside className="space-y-8">
        <div className="glass-panel p-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mb-8">Customer Connection</h2>
          <div className="bg-white p-6 rounded-[2rem] inline-block mb-6 shadow-2xl shadow-indigo-500/5"><QRCodeCanvas value={uploadUrl} size={240} bgColor="#fff" fgColor="#1e1e2e" /></div>
          <p className="text-[11px] text-muted-foreground/80 break-all font-mono mb-6 bg-secondary/50 p-3 rounded-xl border border-border/50">{uploadUrl}</p>
          <button onClick={() => { navigator.clipboard.writeText(uploadUrl); toast.success("Copied!"); }} className="flex items-center gap-2 text-xs font-bold text-primary hover:tracking-widest transition-all"><Copy size={14} /> COPY LINK</button>
        </div>
        <div className="glass-panel p-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mb-6">Network Health</h2>
          <div className="flex items-center gap-3 text-success text-sm font-bold mb-3"><div className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />PROTOCOL ACTIVE</div>
          <p className="text-xs text-muted-foreground/80 leading-relaxed mb-6 italic">Secure memory buffer enabled. Purging in 10m.</p>
          <button onClick={() => window.location.reload()} className="w-full py-3 bg-secondary/50 rounded-xl text-[10px] font-bold tracking-widest hover:bg-secondary transition-all uppercase">Re-Sync Node</button>
        </div>
      </aside>

      <main className="lg:pl-8">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-16 gap-6">
          <div><div className="flex items-center gap-4 mb-3"><div className="w-12 h-12 rounded-2xl pastel-lavender flex items-center justify-center border border-primary/20"><Printer className="text-primary" size={24} /></div><h1 className="text-5xl font-extrabold tracking-tighter italic">Queue</h1></div><p className="text-muted-foreground font-light text-lg">Station Node: <span className="text-primary font-mono font-bold">{shopId}</span></p></div>
          <div className="flex items-center gap-3 text-[10px] font-bold tracking-[.2em] bg-white shadow-sm px-4 py-2 rounded-full border border-border"><Radio size={14} className="text-primary animate-pulse" /> LIVE STREAMING</div>
        </header>

        <section className="mb-12">
          <div className="glass-panel p-1 border-primary/20 shadow-2xl shadow-primary/5 group transition-all">
            <div className="flex flex-col sm:flex-row items-stretch gap-1">
              <div className="flex-1 flex items-center px-6 py-4 gap-4"><div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0 group-hover:rotate-12 transition-transform"><ShieldCheck size={20} /></div>
              <input ref={masterOtpRef} type="text" placeholder="ENTER 6-DIGIT CODE FOR INSTANT RELEASE..." maxLength={6} value={masterOtp} onChange={(e) => { const val = e.target.value.replace(/\D/g, ""); setMasterOtp(val); if (val.length === 6) handleMasterRelease(val); }} className="w-full bg-transparent border-none text-lg font-bold tracking-[0.2em] outline-none" /></div>
              <button onClick={() => handleMasterRelease(masterOtp)} disabled={masterOtp.length !== 6} className="bg-primary text-primary-foreground px-8 py-3 rounded-2xl font-bold transition-all hover:brightness-110 active:scale-95 disabled:opacity-30">RELEASE NOW</button>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
            {jobs.length === 0 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-32 text-center glass-panel opacity-40 italic"><p className="text-muted-foreground font-medium text-lg">Waiting for scans...</p></motion.div>}
            {jobs.map((job) => (
              <motion.div key={job.id} layout initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }} className="glass-panel p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 hover:shadow-2xl transition-all">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 rounded-2xl pastel-lavender flex items-center justify-center border border-primary/10 flex-shrink-0"><FileText className="text-primary/60" size={28} /></div>
                  <div><h3 className="font-bold text-lg mb-1 tracking-tight truncate max-w-[250px]">{job.fileName}</h3><p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">{job.copies} Units • {(job.fileSize / 1024).toFixed(0)} KB</p></div>
                </div>
                <div className="flex items-center gap-3">
                  {verifyingId === job.id ? (
                    <div className="flex gap-3 items-center">
                      <input autoFocus className="bg-secondary/50 border border-primary/20 rounded-xl px-6 h-14 w-40 text-center font-bold text-lg tracking-[.3em] outline-none focus:ring-4 ring-primary/5 transition-all" placeholder="000000" maxLength={6} value={inputCode} onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && handlePrint(job.id, inputCode)} />
                      <button onClick={() => handlePrint(job.id, inputCode)} className="bg-primary text-primary-foreground h-14 px-8 rounded-xl font-bold">VERIFY</button>
                      <button onClick={() => { setVerifyingId(null); setInputCode(""); }} className="h-14 w-14 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:bg-black/5 transition-all">✕</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => setVerifyingId(job.id)} className="bg-primary text-primary-foreground h-14 px-8 rounded-xl font-bold flex items-center gap-3 transition-all hover:brightness-105 active:scale-95 shadow-lg shadow-primary/20 hover:tracking-wide"><ShieldCheck size={18} /> RELEASE PRINT</button>
                      <button onClick={async () => { await removeJob(shopId || "", job.id); delete receivedFiles.current[job.id]; toast.success("Vaporized"); }} className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all active:scale-90"><Trash2 size={20} /></button>
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
