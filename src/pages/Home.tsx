import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Printer, Shield, Clock, Zap, LogOut, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const features = [
  { icon: Shield, title: "Zero Storage", desc: "Files live in memory only — never written to disk" },
  { icon: Clock, title: "Auto-Expire", desc: "Unprinted files vanish after 10 minutes" },
  { icon: Zap, title: "Instant Queue", desc: "Real-time updates across browser tabs" },
];

const Home = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [shopName, setShopName] = useState("");
  const [location, setLocation] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const createShop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName || !location) return;
    
    setIsInitializing(true);
    const slug = `${shopName}-${location}`.toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 32);
    const uniqueId = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
    
    navigate(`/dashboard/${uniqueId}?name=${encodeURIComponent(shopName)}&loc=${encodeURIComponent(location)}`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <div className="min-h-svh flex flex-col p-6">
      {/* Auth Header */}
      <header className="flex justify-between items-center max-w-7xl mx-auto w-full mb-12">
        <div className="flex items-center gap-2 font-bold text-primary italic text-lg">
          <Printer size={20} /> Vprint
        </div>
        <div>
          {session ? (
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-muted-foreground hidden sm:inline uppercase tracking-widest flex items-center gap-2">
                <User size={12} /> {session.user.email}
              </span>
              <button 
                onClick={handleLogout}
                className="p-3 text-muted-foreground hover:text-destructive transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-secondary/50 rounded-xl"
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          ) : (
            <Link to="/login" className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
              Shopkeeper Login
            </Link>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center max-w-lg w-full"
        >
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-8 mx-auto bg-primary/10 border border-primary/20 glow-pastel">
            <Printer className="text-primary" size={42} />
          </div>

          <h1 className="text-6xl font-extrabold tracking-tighter mb-4">
            Vapor<span className="text-gradient-pastel">Print</span>
          </h1>
          <p className="text-muted-foreground mb-10 leading-relaxed text-lg font-light">
            Secure, multi-location document transfer. Open a branch in seconds and manage queues from anywhere.
          </p>

          {session ? (
            <form onSubmit={createShop} className="max-w-sm mx-auto space-y-4">
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Branch Name (e.g. Central Library)"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full bg-secondary/30 border border-border rounded-xl px-5 h-14 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all text-center"
                  required
                />
                <input
                  type="text"
                  placeholder="Location (e.g. Floor 1)"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-secondary/30 border border-border rounded-xl px-5 h-14 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all text-center"
                  required
                />
              </div>
              
              <button
                type="submit"
                disabled={!shopName || !location || isInitializing}
                className="w-full bg-primary text-primary-foreground h-16 rounded-2xl font-bold text-lg transition-all hover:brightness-110 active:scale-95 shadow-xl shadow-primary/20 glow-pastel disabled:opacity-50"
              >
                {isInitializing ? "Creating Station..." : "Launch Station"}
              </button>
            </form>
          ) : (
            <div className="glass-panel p-8 bg-secondary/10">
              <p className="text-sm text-muted-foreground mb-6 font-medium">Please login to initialize and manage shop locations.</p>
              <Link
                to="/login"
                className="inline-flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-bold transition-all hover:scale-105"
              >
                Get Started <ArrowRight size={18} />
              </Link>
            </div>
          )}

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
    </div>
  );
};

// Simplified arrow for the login button
const ArrowRight = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
);

export default Home;
