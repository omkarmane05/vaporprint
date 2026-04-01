import { useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, ShieldCheck, Printer, Minus, Plus, Loader2 } from "lucide-react";
import { addJob, generateId, generateCode } from "@/lib/printQueue";
import { Peer } from "peerjs";

const CustomerUpload = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [copies, setCopies] = useState(1);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setStatus("Connecting to shop...");

    const verificationCode = generateCode();
    const jobId = generateId();

    const peer = new Peer({
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
      },
    });

    peer.on("open", (peerId) => {
      const shopPeerId = `vprint-shop-${shopId?.toLowerCase()}`;
      console.log("[P2P] Connecting to shop:", shopPeerId);
      
      const conn = peer.connect(shopPeerId, {
        reliable: true
      });

      // Timeout if shop is truly offline
      const connectTimeout = setTimeout(() => {
        if (!conn.open) {
          setLoading(false);
          setStatus(null);
          alert("Shop is unreachable. Make sure the Shop Dashboard is open!");
        }
      }, 8000);

      conn.on("open", async () => {
        clearTimeout(connectTimeout);
        setStatus("Handshaking...");
        
        try {
          // Register metadata in DB (No file data stored on server!)
          await addJob(shopId, {
            id: jobId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            fileDataUrl: "P2P_TRANSFER", 
            copies,
            code: verificationCode,
            timestamp: Date.now(),
            shopId,
          });

          setStatus("Transferring file directly...");
          conn.send({
            type: "FILE_TRANSFER",
            jobId,
            fileName: file.name,
            fileType: file.type,
            fileData: file, // Binary File sent over DataChannel
            verificationCode,
          });

          setCode(verificationCode);
          setLoading(false);
          setStatus(null);
        } catch (err) {
          alert("Queue registration failed.");
          setLoading(false);
        }
      });

      conn.on("error", (err) => {
        setLoading(false);
        setStatus(null);
        alert("Shop is offline. Peer connection failed.");
      });
    });

    peer.on("error", () => {
      setLoading(false);
      alert("Connection signaled failed. Check your network.");
    });
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

          {/* Copies */}
          <div className="glass-panel p-5 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Quantity</span>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCopies(Math.max(1, copies - 1))}
                className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
              >
                <Minus size={14} />
              </button>
              <span className="font-bold text-xl min-w-[2ch] text-center">{copies}</span>
              <button
                onClick={() => setCopies(Math.min(50, copies + 1))}
                className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
              >
                <Plus size={14} />
              </button>
            </div>
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
