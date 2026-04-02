import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Printer, Shield, Clock, Zap, ArrowRight } from "lucide-react";

const features = [
  { icon: Shield, title: "Zero Storage", desc: "Files live in memory only — never written to disk" },
  { icon: Clock, title: "Auto-Expire", desc: "Unprinted files vanish after 10 minutes" },
  { icon: Zap, title: "Instant Queue", desc: "Real-time updates across browser tabs" },
];

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-svh flex flex-col items-center justify-center p-6 bg-background relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/5 rounded-full blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-center max-w-xl relative z-10"
      >
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-10 mx-auto bg-primary/10 border border-primary/20 glow-pastel rotate-3">
          <Printer className="text-primary" size={36} />
        </div>

        <h1 className="text-7xl font-extrabold tracking-tighter mb-6">
          <span className="text-gradient-pastel">VaporPrint</span>
        </h1>
        <p className="text-muted-foreground mb-12 leading-relaxed text-xl font-light">
          Experience the world's first privacy-first document transfer system. <br/> 
          <span className="font-medium text-foreground/80">Documents exist only in-flight and vanish the moment they're printed.</span>
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => navigate("/login")}
            className="bg-primary text-primary-foreground px-12 py-5 rounded-[2rem] font-bold text-lg transition-all hover:brightness-110 active:scale-95 shadow-2xl shadow-primary/20 glow-pastel flex items-center gap-3"
          >
            Access Print Station <ArrowRight size={20} />
          </button>
        </div>

        <div className="mt-24 grid grid-cols-1 sm:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="glass-panel p-8 text-left group hover:border-primary/20 transition-all"
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform ${i === 0 ? 'pastel-lavender' : i === 1 ? 'pastel-sky' : 'pastel-mint'}`}>
                <f.icon size={24} className="text-primary/70" />
              </div>
              <h3 className="font-bold text-sm mb-3 uppercase tracking-widest text-foreground/80">{f.title}</h3>
              <p className="text-muted-foreground text-xs leading-relaxed font-medium">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        <footer className="mt-20 pt-10 border-t border-border/40">
           <p className="text-[10px] text-muted-foreground font-bold tracking-[0.4em] uppercase">
             Encrypted Transient Node Mesh • v0.1.0-STABLE
           </p>
        </footer>
      </motion.div>
    </div>
  );
};

export default Home;
