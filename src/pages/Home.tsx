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

  const createShop = () => {
    const shopId = generateShopId();
    navigate(`/dashboard/${shopId}`);
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

        <button
          onClick={createShop}
          className="bg-primary text-primary-foreground px-10 py-5 rounded-2xl font-bold text-lg transition-all hover:brightness-110 active:scale-95 shadow-xl shadow-primary/20 glow-pastel"
        >
          Initialize Shop
        </button>

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
