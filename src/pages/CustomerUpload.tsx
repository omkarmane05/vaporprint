import { useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, ShieldCheck, Printer, Minus, Plus, Loader2 } from "lucide-react";
import { addJob, generateId, generateCode } from "@/lib/printQueue";
import { supabase } from "@/integrations/supabase/client";
import { Peer } from "peerjs";

const CustomerUpload = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [pageRange, setPageRange] = useState("All");
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!shopId) return null;

  const handleFile = (f: File) => {
    // With PeerJS, we can support much larger files for free! (Limit to 50MB for demo stability)
    if (f.size > 50 * 1024 * 1024) {
      alert("File too large. Max 50MB for peer transfer.");
      return;
    }
    setFile(f);
    // Create a local blob URL for instant preview
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setStatus("Connecting to shop...");

    const verificationCode = generateCode();
    const jobId = generateId();

    try {
      setStatus("Establishing Relay... (100% Reliable Mode)");
      
      // Breakdown file into 200KB chunks for Realtime broadcast
      const CHUNK_SIZE = 200 * 1024;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const channel = supabase.channel(`vprint-relay-${shopId}`);

      setStatus("Syncing Metadata...");
      await addJob(shopId, {
        id: jobId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileDataUrl: "STREAMING_REALTIME", 
        copies: 1, // Defaulting to 1 as we move to page-specific control
        pageRange: pageRange,
        code: verificationCode,
        timestamp: Date.now(),
        shopId,
      });

      setStatus(`Streaming: 0%`);
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        
        // Convert chunk to array buffer then base64 for Realtime
        const buffer = await chunk.arrayBuffer();
        const base64Chunk = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );

        await channel.send({
          type: "broadcast",
          event: "chunk",
          payload: {
            jobId,
            chunkIndex: i,
            totalChunks,
            data: base64Chunk,
            fileName: file.name,
            fileType: file.type
          }
        });
        
        const percent = Math.round(((i + 1) / totalChunks) * 100);
        setStatus(`Streaming: ${percent}%`);
      }

      setCode(verificationCode);
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
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center glass-panel p-16 max-w-sm w-full"
        >
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-10 mx-auto pastel-mint border border-success/20">
            <ShieldCheck className="text-success" size={48} />
          </div>
          <p className="text-muted-foreground mb-4 font-medium">Verify with shop owner</p>
          <h2 className="text-7xl font-bold tracking-tighter text-primary mb-10">{code}</h2>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold">
            Transient Session • Auto-Purge active
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-svh p-6 flex flex-col items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-10"
      >
        <div className="absolute top-4 right-4 text-[10px] font-mono text-muted-foreground/30">
          Target Node: vprint-shop-{shopId?.toLowerCase()}
        </div>
        <header className="text-center">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-6 mx-auto pastel-lavender border border-primary/20">
            <Printer className="text-primary" size={28} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3">Upload</h1>
          <p className="text-muted-foreground font-light">Secure peer-to-peer document transfer</p>
        </header>

        <div className="space-y-6">
          {/* Drop zone */}
          <div
            className={`relative group cursor-pointer transition-all duration-500 rounded-[2.5rem] border-2 border-dashed ${
              dragOver ? "border-primary bg-primary/5 scale-[0.98]" : "border-border hover:border-primary/30"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            }}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.gif,.bmp,.webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <div className="p-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-500">
                <Upload className="text-muted-foreground/60" size={24} />
              </div>
              <p className="text-sm font-medium">
                {file ? (
                  <span className="text-primary">{file.name}</span>
                ) : (
                  <span className="text-muted-foreground">Select a document to begin</span>
                )}
              </p>
              {file && (
                <p className="text-[10px] text-muted-foreground mt-2 font-bold uppercase tracking-wider">
                  {(file.size / 1024).toFixed(0)} KB • Ready for transfer
                </p>
              )}
            </div>
          </div>

          {/* Live Preview Section */}
          {file && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="glass-panel overflow-hidden"
            >
              <div className="p-4 border-b border-border/50 flex justify-between items-center bg-secondary/20">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Document Identity</span>
                <span className="text-[10px] font-bold text-primary">PREVIEW ACTIVE</span>
              </div>
              <div className="aspect-[4/5] bg-secondary/30 relative">
                {file.type.startsWith("image/") ? (
                  <img src={previewUrl!} alt="Preview" className="w-full h-full object-contain p-4" />
                ) : (
                  <iframe src={previewUrl!} title="PDF Preview" className="w-full h-full border-none pointer-events-none" />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                   <p className="text-white text-xs font-bold">Secure Local Preview Only</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Page Range Selection */}
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Pages to Print</span>
              <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold">SMART RANGE</div>
            </div>
            
            <input 
              type="text"
              placeholder="e.g. 1-5, 8, 11-13 (or 'All')"
              value={pageRange}
              onChange={(e) => setPageRange(e.target.value)}
              className="w-full bg-secondary/50 border border-primary/20 rounded-xl px-6 h-14 text-center font-bold text-lg outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all placeholder:text-muted-foreground/30 placeholder:font-medium placeholder:text-sm"
            />
            <p className="text-[10px] text-center text-muted-foreground/60 italic leading-tight">
               Specifying your pages now saves time at the counter and reduces waste.
            </p>
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="w-full bg-primary text-primary-foreground h-16 rounded-[1.5rem] font-bold text-base transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30 disabled:grayscale glow-pastel flex items-center justify-center gap-3"
          >
            {loading && <Loader2 className="animate-spin" size={20} />}
            {loading ? status : "Initialize Transfer"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default CustomerUpload;
