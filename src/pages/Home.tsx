import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Printer, Shield, Clock, Zap, LogOut, User, 
  MapPin, ExternalLink, ShieldAlert, Loader2, ArrowRight 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAssignedShops, Shop, ADMIN_EMAIL } from "@/lib/shops";

const features = [
  { icon: Shield, title: "Zero Storage", desc: "Files live in memory only — never written to disk" },
  { icon: Clock, title: "Auto-Expire", desc: "Unprinted files vanish after 10 minutes" },
  { icon: Zap, title: "Instant Queue", desc: "Real-time updates across browser tabs" },
];

const Home = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchShops();
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchShops();
      else {
        setShops([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchShops = async () => {
    setLoading(true);
    try {
      const assigned = await getAssignedShops();
      setShops(assigned);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const openDashboard = (shop: Shop) => {
    navigate(`/dashboard/${shop.id}?name=${encodeURIComponent(shop.name)}&loc=${encodeURIComponent(shop.location)}`);
  };

  return (
    <div className="min-h-svh flex flex-col p-6 bg-background">
      {/* Premium Header */}
      <header className="flex justify-between items-center max-w-7xl mx-auto w-full mb-12">
        <div className="flex items-center gap-3 font-bold text-primary italic text-xl">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
             <Printer size={16} />
          </div>
          Vprint
        </div>
        <div>
          {session ? (
            <div className="flex items-center gap-4">
              {session.user.email === ADMIN_EMAIL && (
                <Link 
                  to="/admin" 
                  className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-[10px] font-bold uppercase tracking-widest border border-primary/20 hover:bg-primary/20 transition-all flex items-center gap-2"
                >
                   <Shield size={12} /> Manage Network
                </Link>
              )}
              <span className="text-[10px] font-bold text-muted-foreground hidden sm:inline uppercase tracking-[0.2em] bg-secondary/50 px-3 py-1.5 rounded-full">
                 {session.user.email}
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
              Owner Login
            </Link>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center max-w-2xl w-full"
        >
          <div className="mb-12 text-center">
            <h1 className="text-6xl font-extrabold tracking-tighter mb-4">
               Station <span className="text-gradient-pastel">Control</span>
            </h1>
            <p className="text-muted-foreground leading-relaxed text-lg font-light">
              Manage your assigned printing hubs with multi-location P2P sync.
            </p>
          </div>

          {!session ? (
            <motion.div 
               initial={{ y: 20, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               className="glass-panel p-10 bg-secondary/5 overflow-hidden relative group"
            >
               <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12 group-hover:rotate-45 transition-transform">
                  <Shield size={120} />
               </div>
               <div className="relative z-10 text-center flex flex-col items-center">
                  <p className="text-base text-muted-foreground mb-8 font-medium">Access is restricted to authorized shop owners.</p>
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-3 px-10 py-5 bg-primary text-primary-foreground rounded-2xl font-bold text-lg shadow-2xl shadow-primary/30 transition-all hover:scale-105"
                  >
                    Authenticate Now <ArrowRight size={20} />
                  </Link>
               </div>
            </motion.div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2 mb-4">
                 <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground/60">Your Assigned Branches</h2>
                 {loading && <Loader2 size={14} className="animate-spin text-primary" />}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AnimatePresence mode="popLayout">
                  {shops.length > 0 ? (
                    shops.map((shop, i) => (
                      <motion.button
                        key={shop.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.1 }}
                        onClick={() => openDashboard(shop)}
                        className="glass-panel p-6 text-left hover:scale-[1.02] transition-all hover:border-primary/40 group hover:shadow-2xl hover:shadow-primary/5"
                      >
                         <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                               <Printer size={20} />
                            </div>
                            <ExternalLink size={14} className="text-muted-foreground/30 group-hover:text-primary transition-colors" />
                         </div>
                         <h3 className="text-xl font-bold mb-1">{shop.name}</h3>
                         <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider">
                            <MapPin size={12} className="text-primary/60" /> {shop.location}
                         </div>
                      </motion.button>
                    ))
                  ) : !loading && (
                    <motion.div 
                      key="no-shops"
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }}
                      className="col-span-full py-16 px-8 rounded-[2rem] border-2 border-dashed border-border flex flex-col items-center justify-center"
                    >
                       <ShieldAlert className="text-muted-foreground/20 mb-4" size={48} />
                       <p className="text-muted-foreground font-medium text-sm mb-1">No Hubs Assigned</p>
                       <p className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-widest text-center">Contact your administrator at: <br/><span className="text-primary italic text-[11px]">omkarmane512@gmail.com</span></p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-8">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="glass-panel p-6 text-left border-border/40"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${i === 0 ? 'pastel-lavender' : i === 1 ? 'pastel-sky' : 'pastel-mint'}`}>
                   <f.icon size={20} className="text-primary/70" />
                </div>
                <h3 className="font-bold text-[11px] uppercase tracking-widest mb-2">{f.title}</h3>
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
