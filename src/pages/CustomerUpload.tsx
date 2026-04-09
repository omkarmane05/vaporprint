
import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, ShieldCheck, Printer, Minus, Plus, Loader2 } from "lucide-react";
import { addJob, generateId, generateCode } from "@/lib/printQueue";
import { supabase } from "@/integrations/supabase/client";
import { Peer } from "peerjs";

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

  if (!shopId) return null;

  const handleFile = (f: File) => {
    if (f.size > 50 * 1024 * 1024) {
      alert("File too large. Max 50MB for peer transfer.");
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setStatus("Connecting to shop...");

    const verificationCode = generateCode();
    const jobId = generateId();

    try {
      setStatus("Establishing Relay... (100% Reliable Mode)");
      const CHUNK_SIZE = 100 * 1024; // Safer chunk size for Supabase Realtime (200KB limit)
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const channel = supabase.channel(`vprint-relay-${shopId}`);

      setStatus("Syncing Metadata...");
      await addJob(shopId, {
        id: jobId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileDataUrl: "STREAMING_REALTIME", 
        copies,
        code: verificationCode,
        timestamp: Date.now(),
        shopId,
      });

      setStatus(`Streaming: 0%`);
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkContent = file.slice(start, end);
        const buffer = await chunkContent.arrayBuffer();
        const base64Chunk = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );

        await channel.send({
          type: "broadcast",
          event: "chunk",
          payload: { jobId, chunkIndex: i, totalChunks, data: base64Chunk, fileName: file.name, fileType: file.type }
        });
        
        const percent = Math.round(((i + 1) / totalChunks) * 100);
        setStatus(`Streaming: ${percent}%`);
      }

      setCode(verificationCode);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]); // SUCCESS HAPTIC
      }
      setLoading(false);
      setStatus(null);
    } catch (err: any) {
      console.error("[Link Error]", err);
      setStatus(`Link Failed: ${err.message || "Unknown error"}`);
      setLoading(false);
    }
  };

  if (code) {
    return (
      <div className="min-h-svh flex items-center justify-center p-6 bg-background">
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center glass-panel p-16 max-w-sm w-full">
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-10 mx-auto pastel-mint border border-success/20"><ShieldCheck className="text-success" size={48} /></div>
          <p className="text-muted-foreground mb-4 font-medium italic">Station: {shopName || shopId}</p>
          <h2 className="text-7xl font-bold tracking-tighter text-primary mb-10">{code}</h2>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold">Transient Session • Locked</p>
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
            <input ref={inputRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <div className="p-16 text-center"><div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-6"><Upload className="text-muted-foreground/60" size={24} /></div><p className="text-sm font-medium">{file ? <span className="text-primary">{file.name}</span> : <span className="text-muted-foreground font-light">Select document</span>}</p></div>
          </div>
          <div className="glass-panel p-5 flex items-center justify-between"><span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Quantity</span><div className="flex items-center gap-4"><button onClick={() => setCopies(Math.max(1, copies - 1))} className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center active:scale-90">-</button><span className="font-bold text-xl">{copies}</span><button onClick={() => setCopies(Math.min(50, copies + 1))} className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center active:scale-90">+</button></div></div>
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
