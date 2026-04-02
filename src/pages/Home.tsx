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
  // Home page now acts as a high-end enterprise landing page
  const [isHovered, setIsHovered] = useState(false);

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

        <div className="flex flex-col items-center gap-6">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate("/login")}
            className="bg-primary text-primary-foreground px-12 py-6 rounded-2xl font-extrabold text-xl transition-all shadow-2xl shadow-primary/30 glow-pastel flex items-center gap-4 group"
          >
            ACCESS PARTNER HUB <Zap className="group-hover:text-yellow-400 transition-colors" size={24} />
          </motion.button>
          
          <p className="text-[10px] uppercase font-bold tracking-[.4em] text-muted-foreground/30">
            ENCRYPTED NETWORK • INVITE ONLY
          </p>
        </div>

        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-8 mb-16">
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

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="pt-10 border-t border-border/40"
        >
          <button
            onClick={() => navigate("/login")}
            className="flex items-center gap-2 mx-auto text-[10px] font-bold tracking-[.3em] uppercase text-muted-foreground hover:text-primary transition-all group"
          >
            <Shield size={14} className="group-hover:rotate-12 transition-transform" /> COMMAND CENTER ACCESS
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Home;
