
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, FileText, ShieldCheck, Printer, Copy, Trash2, Lock, Shield, Loader2, Radio, Mail, LogOut, Eye, X } from "lucide-react";
import { type PrintJob } from "@/lib/printQueue";
import { usePrintQueue } from "@/hooks/usePrintQueue";
import { verifyAndPrint, removeJob } from "@/lib/printQueue";
import { toast } from "sonner";
import { Peer } from "peerjs";
import { supabase } from "@/integrations/supabase/client";

const ShopDashboard = () => {
  const navigate = useNavigate();
  const { shopId } = useParams<{ shopId: string }>();
  const { jobs, fetchJobs } = usePrintQueue(shopId || "");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState("");
  const [masterOtp, setMasterOtp] = useState("");
  const masterOtpRef = useRef<HTMLInputElement>(null);
  const [previewItem, setPreviewItem] = useState<{ job: PrintJob; url: string } | null>(null);

  // Auth states
  const [isVerifyingShop, setIsVerifyingShop] = useState(true);
  const [shopData, setShopData] = useState<{ name: string; status: string; owner_id: string | null } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [receivingProgress, setReceivingProgress] = useState<Record<string, number>>({});
  const receivedFiles = useRef<Record<string, { blob: Blob; fileName: string; fileType: string }>>({});
  const chunkBuffer = useRef<Map<string, string[]>>(new Map());

  useEffect(() => {
    checkShopAndAuth();
  }, [shopId]);

  const checkShopAndAuth = async () => {
    if (!shopId) return;

    try {
      // Fetch shop data (no password column — it's been removed)
      const { data, error } = await supabase
        .from("shops")
        .select("name, status, owner_id")
        .eq("id", shopId)
        .single();

      if (error || !data) {
        setIsVerifyingShop(false);
        return;
      }

      setShopData(data);

      // Check existing Supabase Auth session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const isOwner = data.owner_id === session.user.id;
        const isAdmin = session.user.app_metadata?.role === "admin";
        if (isOwner || isAdmin) {
          setIsAuthenticated(true);
        }
      }
    } catch {
      // Silent fail
    } finally {
      setIsVerifyingShop(false);
    }
  };

  // PeerJS + Relay connection (Starts early, doesn't reset on auth change)
  useEffect(() => {
    if (!shopId) return;

    const safeShopId = shopId.toLowerCase();
    const peerId = `vprint-shop-${safeShopId}`;
    let destroyed = false;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let relayChannel: ReturnType<typeof supabase.channel> | null = null;

    const MAX_RETRIES = 5;
    const getBackoff = (attempt: number) => Math.min(1000 * 2 ** attempt, 10000);

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

    peer.on("error", (err) => {
      console.error("[P2P Station Error]", err);
      if (err.type === 'id-taken') {
        toast.error("Station ID collision: Is the dashboard open in another tab? P2P disabled for this session.");
      }
    });

    // --- Relay channel handler callbacks (stable across reconnects) ---
    const handleHandshake = (payload: any) => {
      const { jobId, totalChunks } = payload.payload;
      if (!chunkBuffer.current.has(jobId)) {
        chunkBuffer.current.set(jobId, new Array(totalChunks).fill(null));
        chunkBuffer.current.set(jobId + "_count", 0);
        setReceivingProgress(prev => ({ ...prev, [jobId]: 0 }));
        fetchJobs(); // AUTONOMOUS SYNC
      }
    };

    const handleChunk = (payload: any) => {
      const { jobId, chunkIndex, totalChunks, data, fileName, fileType } = payload.payload;

      if (!chunkBuffer.current.has(jobId)) {
        chunkBuffer.current.set(jobId, new Array(totalChunks).fill(null));
        chunkBuffer.current.set(jobId + "_count", 0);
        fetchJobs(); // AUTONOMOUS SYNC (if handshake missed)
      }

      const chunks = chunkBuffer.current.get(jobId)!;

      // Only process if we haven't received this chunk yet
      if (chunks[chunkIndex] === null) {
        chunks[chunkIndex] = data;

        const currentCount = (chunkBuffer.current.get(jobId + "_count") as number) + 1;
        chunkBuffer.current.set(jobId + "_count", currentCount);

        const progress = Math.round((currentCount / totalChunks) * 100);
        setReceivingProgress(prev => ({ ...prev, [jobId]: progress }));

        if (currentCount === totalChunks) {
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
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(200);
          toast.success(`Received: ${fileName}`);
          chunkBuffer.current.delete(jobId);
        }
      }
    };

    // --- Subscribe with auto-retry ---
    const subscribeRelay = () => {
      if (destroyed) return;

      // Clean up previous channel if it exists
      if (relayChannel) {
        supabase.removeChannel(relayChannel);
        relayChannel = null;
      }

      relayChannel = supabase
        .channel(`vprint-relay-${safeShopId}`, {
          config: { broadcast: { ack: true } },
        })
        .on("broadcast", { event: "handshake" }, handleHandshake)
        .on("broadcast", { event: "chunk" }, handleChunk)
        .on("broadcast", { event: "file_ready" }, (payload: any) => {
          const { jobId, fileName, fileType, storageUrl } = payload.payload;
          // Download from Storage and cache locally for instant release
          fetch(storageUrl)
            .then(res => res.blob())
            .then(blob => {
              receivedFiles.current[jobId] = { blob, fileName, fileType };
              setReceivingProgress(prev => ({ ...prev, [jobId]: 100 }));
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(200);
              toast.success(`Received: ${fileName}`);
              fetchJobs(); // Refresh to get updated file_data_url
            })
            .catch(() => {
              // Storage download failed — station will retry on print
              fetchJobs();
            });
        })
        .subscribe((status) => {
          if (destroyed) return;

          if (status === "SUBSCRIBED") {
            console.log("Relay Link Established:", safeShopId);
            if (retryCount > 0) {
              toast.success("Relay reconnected successfully.");
            }
            retryCount = 0; // Reset on success
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("Relay Link Failed:", status, `(attempt ${retryCount + 1}/${MAX_RETRIES})`);

            if (retryCount < MAX_RETRIES) {
              const delay = getBackoff(retryCount);
              retryCount++;
              console.log(`Relay retry #${retryCount} in ${delay}ms...`);
              retryTimer = setTimeout(subscribeRelay, delay);
            } else {
              toast.error("Realtime network error. Please refresh the dashboard.");
            }
          }
        });
    };

    subscribeRelay();

    peer.on("connection", (conn) => {
      conn.on("data", (data: any) => {
        if (data.type === "FILE_TRANSFER") {
          const blob = data.fileData instanceof Blob ? data.fileData : new Blob([data.fileData], { type: data.fileType });
          receivedFiles.current[data.jobId] = {
            blob,
            fileName: data.fileName,
            fileType: data.fileType,
          };
          setReceivingProgress(prev => ({ ...prev, [data.jobId]: 100 }));
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(200);
          toast.success(`New file received via P2P: ${data.fileName}`);
        }
      });
    });

    return () => {
      destroyed = true;
      if (retryTimer) clearTimeout(retryTimer);
      peer.destroy();
      if (relayChannel) supabase.removeChannel(relayChannel);
    };
  }, [shopId]);

  // Cleanup interval effect (Isolated from connection logic)
  useEffect(() => {
    if (!isAuthenticated) return;
    const cleanupInterval = setInterval(async () => {
      try {
        await supabase.rpc("cleanup_expired_jobs");
      } catch {
        // Silent fail
      }
    }, 30000);
    return () => clearInterval(cleanupInterval);
  }, [isAuthenticated]);

  // Polling fallback for "UPLOADING" jobs (Fixes mobile sync delays)
  useEffect(() => {
    const hasPendingJobs = jobs.some(j => j.fileDataUrl === "UPLOADING" || j.fileDataUrl === "STREAMING_REALTIME");
    if (!hasPendingJobs) return;

    const pollInterval = setInterval(() => {
      fetchJobs();
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [jobs, fetchJobs]);

  const handlePrint = async (jobId: string, directCode?: string) => {
    const activeCode = directCode || inputCode;

    if (!activeCode || activeCode.length < 4) {
      toast.error("Please enter the verification code.");
      return;
    }

    // PRE-EMPTIVE POPUP AVOIDANCE: Open window immediately on user-thread
    const printWindow = window.open("about:blank", "_blank");
    if (!printWindow) {
      toast.error("Popup blocked! Please allow popups for this station.");
      return;
    }

    // Set a loading state in the popup
    printWindow.document.write("<html><body style='display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#666'><h3>Vaporizing into document format...</h3></body></html>");

    const job = await verifyAndPrint(shopId || "", jobId, activeCode);

    if (!job) {
      printWindow.close();
      toast.error("Invalid verification code.");
      return;
    }

    // Try local blob first (P2P/realtime), then fall back to Storage URL
    let fileBlob: Blob | null = null;
    let fileName = job.fileName;
    let fileType = job.fileType;

    const localData = receivedFiles.current[jobId];
    if (localData && localData.blob && localData.blob.size > 0) {
      fileBlob = localData.blob;
      fileName = localData.fileName;
      fileType = localData.fileType;
    } else if (job.fileDataUrl && job.fileDataUrl !== "UPLOADING" && job.fileDataUrl !== "STREAMING_REALTIME") {
      // Download from Supabase Storage
      try {
        const res = await fetch(job.fileDataUrl);
        if (!res.ok) throw new Error("Download failed");
        fileBlob = await res.blob();
      } catch (err) {
        printWindow.close();
        toast.error("Failed to download file from storage. Ask customer to re-upload.");
        return;
      }
    }

    if (!fileBlob || fileBlob.size === 0) {
      printWindow.close();
      toast.error("File data missing or still uploading. Please wait or ask customer to re-upload.");
      return;
    }

    const url = URL.createObjectURL(fileBlob);

    // For PDFs and Images, we can try to render them directly for printing
    if (fileType === "application/pdf" || fileType.startsWith("image/")) {
      printWindow.document.body.style.margin = "0";
      printWindow.document.body.innerHTML = fileType === "application/pdf"
        ? `<embed src="${url}" type="application/pdf" width="100%" height="100%">`
        : `<div style="display:flex;justify-content:center;align-items:center;min-height:100vh;"><img src="${url}" style="max-width:100%;height:auto;box-shadow:0 0 50px rgba(0,0,0,0.1)"></div>`;

      // Attempt to auto-print after a small load delay
      setTimeout(() => {
        try { printWindow.print(); } catch (e) { }
      }, 1000);
    } else {
      // For other types, we have to let the browser handle it (which might download)
      printWindow.location.href = url;
    }

    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50);
    toast.success(`Released: ${fileName}`);

    // VAPORIZE: Revoke the local URL after 60 seconds to ensure it doesn't persist in memory
    setTimeout(() => {
      URL.revokeObjectURL(url);
      delete receivedFiles.current[jobId];
    }, 60000);

    // Clean up storage file in background
    if (job.fileDataUrl && job.fileDataUrl.includes("vprint-uploads")) {
      try {
        const pathMatch = job.fileDataUrl.split("/vprint-uploads/")[1];
        if (pathMatch) {
          supabase.storage.from("vprint-uploads").remove([decodeURIComponent(pathMatch)]);
        }
      } catch { /* best effort cleanup */ }
    }

    setInputCode("");
    setVerifyingId(null);
  };

  const handlePreview = async (job: PrintJob) => {
    let fileBlob: Blob | null = null;
    const localData = receivedFiles.current[job.id];
    
    if (localData && localData.blob && localData.blob.size > 0) {
      fileBlob = localData.blob;
    } else if (job.fileDataUrl && job.fileDataUrl !== "UPLOADING" && job.fileDataUrl !== "STREAMING_REALTIME") {
      try {
        const res = await fetch(job.fileDataUrl);
        if (!res.ok) throw new Error("Download failed");
        fileBlob = await res.blob();
      } catch (err) {
        toast.error("Failed to load preview.");
        return;
      }
    }

    if (!fileBlob) {
      toast.error("File still uploading...");
      return;
    }

    const url = URL.createObjectURL(fileBlob);
    setPreviewItem({ job, url });
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    toast.success("Station Secured (Logged Out)");
  };

  const handleLogin = async () => {
    if (!shopData || !shopId || !loginEmail || !loginPassword) return;
    setIsLoggingIn(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) throw error;

      // Verify this user owns the shop or is admin
      const isOwner = shopData.owner_id === data.user.id;
      const isAdmin = data.user.app_metadata?.role === "admin";

      if (!isOwner && !isAdmin) {
        toast.error("Access denied. You don't own this station.");
        await supabase.auth.signOut();
        setIsLoggingIn(false);
        return;
      }

      setIsAuthenticated(true);
      toast.success("Station Unlocked");
    } catch (err: any) {
      toast.error("Login failed: " + (err.message || "Invalid credentials"));
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (isVerifyingShop) return <div className="min-h-svh flex items-center justify-center bg-background"><Loader2 className="animate-spin text-primary" size={32} /></div>;
  if (!shopData) return <div className="min-h-svh flex flex-col items-center justify-center p-6"><h1 className="text-4xl font-extrabold opacity-20 italic">VaporPrint</h1><p className="text-muted-foreground mt-4">Station ID Not Found</p></div>;

  if (!isAuthenticated && shopData.status === "active") {
    return (
      <div className="min-h-svh flex items-center justify-center p-6 bg-background">
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md glass-panel p-10 text-center space-y-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto"><Lock className="text-primary" size={24} /></div>
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight italic">{shopData.name}</h1>
            <p className="text-muted-foreground text-sm font-light">Station Secured • Sign In</p>
          </div>
          <div className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="w-full bg-secondary/50 border border-primary/10 rounded-2xl px-6 h-14 font-bold text-lg text-center outline-none focus:ring-4 ring-primary/5 transition-all"
              autoFocus
            />
            <input
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="w-full bg-secondary/50 border border-primary/10 rounded-2xl px-6 h-14 font-bold text-lg text-center outline-none focus:ring-4 ring-primary/5 transition-all"
            />
          </div>
          <button onClick={handleLogin} disabled={isLoggingIn || !loginEmail || !loginPassword} className="w-full bg-primary text-primary-foreground h-14 rounded-2xl font-bold transition-all hover:brightness-105 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-30">
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
          <p className="text-xs text-muted-foreground/80 leading-relaxed mb-6 italic">Secure session active. Auto-purge enabled.</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-secondary/50 rounded-xl text-[10px] font-bold tracking-widest hover:bg-secondary transition-all mb-3 uppercase"
          >
            Re-Sync Node
          </button>
          <button
            onClick={handleLogout}
            className="w-full py-3 bg-destructive/10 text-destructive rounded-xl text-[10px] font-bold tracking-widest hover:bg-destructive/20 transition-all uppercase flex items-center justify-center gap-2"
          >
            <LogOut size={12} /> SECURE LOGOUT
          </button>
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
                  <div>
                    <h3 className="font-bold text-lg mb-1 tracking-tight truncate max-w-[250px]">{job.fileName}</h3>
                    <div className="flex items-center gap-2">
                      <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">{job.copies} Units • {(job.fileSize / 1024).toFixed(0)} KB</p>
                      {receivingProgress[job.id] !== undefined && receivingProgress[job.id] < 100 && (
                        <span className="text-primary text-[10px] font-black animate-pulse">STREAMING: {receivingProgress[job.id]}%</span>
                      )}
                      {(receivingProgress[job.id] === 100 || (job.fileDataUrl && job.fileDataUrl.startsWith("http"))) && (
                        <span className="text-success text-[10px] font-black">READY</span>
                      )}
                      {!receivingProgress[job.id] && job.fileDataUrl === "UPLOADING" && (
                        <span className="text-amber-500 text-[10px] font-black animate-pulse">UPLOADING...</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {(() => {
                    const hasLocalBlob = receivingProgress[job.id] === 100;
                    const hasStorageUrl = job.fileDataUrl && job.fileDataUrl !== "UPLOADING" && job.fileDataUrl !== "STREAMING_REALTIME" && job.fileDataUrl.startsWith("http");
                    const isReady = hasLocalBlob || hasStorageUrl;
                    const isStreaming = receivingProgress[job.id] !== undefined && receivingProgress[job.id] < 100;

                      return verifyingId === job.id ? (
                        <div className="flex gap-3 items-center">
                          <input autoFocus className="bg-secondary/50 border border-primary/20 rounded-xl px-6 h-14 w-40 text-center font-bold text-lg tracking-[.3em] outline-none focus:ring-4 ring-primary/5 transition-all" placeholder="000000" maxLength={6} value={inputCode} onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && handlePrint(job.id, inputCode)} />
                          <button onClick={() => handlePrint(job.id, inputCode)} className="bg-primary text-primary-foreground h-14 px-8 rounded-xl font-bold">VERIFY</button>
                          <button onClick={() => { setVerifyingId(null); setInputCode(""); }} className="h-14 w-14 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:bg-black/5 transition-all">✕</button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => handlePreview(job)}
                            disabled={!isReady}
                            className="bg-secondary text-muted-foreground h-14 px-6 rounded-xl font-bold flex items-center gap-2 transition-all hover:bg-secondary/70 disabled:opacity-30"
                          >
                            <Eye size={16} />
                            Preview
                          </button>
                          
                          <button
                            onClick={() => setVerifyingId(job.id)}
                            disabled={!isReady}
                            className="bg-primary text-primary-foreground h-14 px-8 rounded-xl font-bold flex items-center gap-3 transition-all hover:brightness-105 active:scale-95 shadow-lg shadow-primary/20 hover:tracking-wide disabled:opacity-30 disabled:grayscale"
                          >
                          <ShieldCheck size={18} />
                          {isStreaming ? "STREAMING..." : isReady ? "RELEASE PRINT" : "UPLOADING..."}
                        </button>

                        <button onClick={async () => { await removeJob(shopId || "", job.id); delete receivedFiles.current[job.id]; fetchJobs(); toast.success("Vaporized"); }} className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all active:scale-90"><Trash2 size={20} /></button>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {previewItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              URL.revokeObjectURL(previewItem.url);
              setPreviewItem(null);
            }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden glass-panel !p-0 cursor-default"
            >
              <div className="p-4 flex items-center justify-between border-b border-border bg-background/50">
                <h3 className="font-bold truncate pr-4">{previewItem.job.fileName}</h3>
                <button
                  onClick={() => {
                    URL.revokeObjectURL(previewItem.url);
                    setPreviewItem(null);
                  }}
                  className="p-2 hover:bg-secondary rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-auto p-4 bg-muted/30 flex items-center justify-center">
                {previewItem.job.fileType.startsWith("image/") ? (
                  <img
                    src={previewItem.url}
                    alt={previewItem.job.fileName}
                    className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                  />
                ) : previewItem.job.fileType === "application/pdf" ? (
                  <iframe
                    src={previewItem.url}
                    className="w-full h-[70vh] rounded-lg bg-white"
                    title={previewItem.job.fileName}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
                    <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
                      <FileText size={32} />
                    </div>
                    <p className="font-medium text-lg">Preview not available</p>
                    <p className="text-sm opacity-60">{previewItem.job.fileType}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShopDashboard;
