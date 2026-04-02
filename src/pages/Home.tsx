import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Printer, Shield, Clock, Zap } from "lucide-react";
import { generateShopId } from "@/lib/printQueue";

const features = [
  { icon: Shield, title: "Zero Storage", desc: "Files live in memory only — never written to disk" },
  { icon: Clock, title: "Auto-Expire", desc: "Unprinted files vanish after 10 minutes" },
  { icon: Zap, title: "Instant Queue", desc: "Real-time updates across browser tabs" },
];

const Home = () => {
  const navigate = useNavigate();
  const [shopName, setShopName] = useState("");
  const [location, setLocation] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);

  const createShop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName || !location) return;
    
    setIsInitializing(true);
    // Create a permanent-style slug from Name + Location
    const slug = `${shopName}-${location}`.toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 32);
    const uniqueId = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
    
    // Store metadata temporarily? (Or just pass via URL for now)
    navigate(`/dashboard/${uniqueId}?name=${encodeURIComponent(shopName)}&loc=${encodeURIComponent(location)}`);
  };

  return (
    <div className="min-h-svh flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-center max-w-lg"
      >
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-8 mx-auto bg-primary/10 border border-primary/20 glow-pastel">
          <Printer className="text-primary" size={36} />
        </div>

        <h1 className="text-6xl font-extrabold tracking-tighter mb-4">
          <span className="text-gradient-pastel">VaporPrint</span>
        </h1>
        <p className="text-muted-foreground mb-10 leading-relaxed text-lg font-light">
          Experience privacy-first document transfer. Files exist only in-flight and vanish the moment they're printed.
        </p>

        <form onSubmit={createShop} className="max-w-sm mx-auto space-y-4">
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Shop Name (e.g. Central Copy)"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-xl px-5 h-14 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all text-center"
              required
            />
            <input
              type="text"
              placeholder="Location (e.g. Main Street)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-xl px-5 h-14 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all text-center"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={!shopName || !location || isInitializing}
            className="w-full bg-primary text-primary-foreground h-16 rounded-2xl font-bold text-lg transition-all hover:brightness-110 active:scale-95 shadow-xl shadow-primary/20 glow-pastel disabled:opacity-50"
          >
            {isInitializing ? "Initializing Hub..." : "Initialize New Branch"}
          </button>
        </form>

        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="glass-panel p-6 text-left"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${i === 0 ? 'pastel-lavender' : i === 1 ? 'pastel-sky' : 'pastel-mint'}`}>
                <f.icon size={20} className="text-primary/70" />
              </div>
              <h3 className="font-bold text-sm mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-xs leading-relaxed font-medium">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default Home;
