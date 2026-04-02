import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Mail, Shield, ShieldAlert, CheckCircle2, Copy, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const AdminDashboard = () => {
  const [shops, setShops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newShopName, setNewShopName] = useState("");
  const [newShopEmail, setNewShopEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchShops();
  }, []);

  const fetchShops = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("shops").select("*").order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setShops(data || []);
    }
    setLoading(false);
  };

  const addShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    const { data, error } = await supabase.from("shops").insert({
      shop_name: newShopName,
      owner_email: newShopEmail.toLowerCase(),
      status: "pending"
    }).select().single();

    if (error) {
      toast.error(error.message);
      setCreating(false);
      return;
    }

    toast.success(`Success! Shop ${newShopName} registered.`);
    setNewShopName("");
    setNewShopEmail("");
    setShops([data, ...shops]);
    setCreating(false);
  };

  const deleteShop = async (id: string) => {
    const { error } = await supabase.from("shops").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      setShops(shops.filter(s => s.id !== id));
      toast.success("Shop vaporized from system.");
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-svh p-8 md:p-16 bg-background grid lg:grid-cols-[400px_1fr] gap-16 max-w-[1700px] mx-auto">
      {/* Sidebar: Command Center */}
      <aside className="space-y-10">
        <header>
          <div className="flex items-center gap-4 mb-3">
             <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
               <ShieldAlert className="text-primary" size={24} />
             </div>
             <h1 className="text-4xl font-extrabold tracking-tight">Root</h1>
          </div>
          <p className="text-muted-foreground font-light text-lg">System Administrator</p>
        </header>

        <section className="glass-panel p-8 space-y-8">
           <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">Register New Client</h2>
           <form onSubmit={addShop} className="space-y-6">
              <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Shop/Station Name</label>
                 <input 
                   required
                   value={newShopName}
                   onChange={(e) => setNewShopName(e.target.value)}
                   className="w-full bg-secondary/50 border border-border/50 rounded-xl px-5 h-12 outline-none focus:border-primary/20 transition-all font-medium"
                   placeholder="Neon Print Center"
                 />
              </div>

              <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Owner Email</label>
                 <input 
                   type="email"
                   required
                   value={newShopEmail}
                   onChange={(e) => setNewShopEmail(e.target.value)}
                   className="w-full bg-secondary/50 border border-border/50 rounded-xl px-5 h-12 outline-none focus:border-primary/20 transition-all font-medium"
                   placeholder="owner@neonprint.com"
                 />
              </div>

              <button 
                disabled={creating}
                className="w-full bg-primary text-primary-foreground h-14 rounded-2xl font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all glow-pastel disabled:opacity-50"
              >
                {creating ? <Loader2 className="animate-spin" size={20} /> : <Plus size={18} />}
                INITIALIZE SETUP
              </button>
           </form>
        </section>

        <button 
          onClick={logout}
          className="w-full flex items-center justify-center gap-3 py-4 text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground hover:text-destructive transition-all hover:bg-destructive/5 rounded-2xl border border-transparent hover:border-destructive/10"
        >
          <LogOut size={16} /> TERMINATE ADMIN SESSION
        </button>
      </aside>

      {/* Main Table: Shop Registry */}
      <main>
        <div className="flex items-end justify-between mb-12">
           <h2 className="text-5xl font-extrabold tracking-tighter">Inventory</h2>
           <div className="text-[10px] uppercase font-bold tracking-[0.3em] text-muted-foreground/60 bg-white px-5 py-2 rounded-full border border-border shadow-sm">
             {loading ? "SYNCING..." : `${shops.length} ACTIVE NODES`}
           </div>
        </div>

        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
            {loading ? (
               <div className="py-40 text-center flex flex-col items-center gap-6">
                 <Loader2 className="animate-spin text-primary/30" size={40} />
                 <p className="text-muted-foreground/60 font-mono text-xs uppercase tracking-widest">Hydrating Registry...</p>
               </div>
            ) : shops.length === 0 ? (
               <div className="py-40 text-center glass-panel">
                 <Shield className="mx-auto mb-6 text-muted-foreground/20" size={48} />
                 <p className="text-muted-foreground font-medium">No shops deployed to the grid.</p>
               </div>
            ) : (
              shops.map((shop) => (
                <motion.div
                  key={shop.id}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="glass-panel p-6 flex flex-col sm:flex-row items-center justify-between gap-6 group hover:border-primary/20 transition-all hover:shadow-2xl hover:shadow-primary/5"
                >
                  <div className="flex items-center gap-6">
                     <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${shop.status === 'active' ? 'bg-success/10 border-success/20 text-success' : 'bg-primary/5 border-primary/10 text-primary'}`}>
                        {shop.status === 'active' ? <CheckCircle2 size={24} /> : <Mail size={24} />}
                     </div>
                     <div className="space-y-1">
                        <h3 className="text-lg font-bold tracking-tight">{shop.shop_name}</h3>
                        <div className="flex items-center gap-3">
                           <span className="text-xs text-muted-foreground font-medium">{shop.owner_email}</span>
                           <span className="w-1 h-1 rounded-full bg-border" />
                           <span className={`text-[9px] uppercase font-bold tracking-[0.1em] px-2 py-0.5 rounded-md ${shop.status === 'active' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                             {shop.status}
                           </span>
                        </div>
                     </div>
                  </div>

                  <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                      onClick={() => {
                        const setupUrl = `${window.location.origin}/setup/${shop.id}`;
                        navigator.clipboard.writeText(setupUrl);
                        toast.success("Setup Link copied! Email it to vendor.");
                      }}
                      className="h-12 px-5 flex items-center gap-2 rounded-xl bg-secondary/50 text-xs font-bold text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all active:scale-95 border border-border/50"
                    >
                      <Copy size={16} /> COPY INVITE LINK
                    </button>
                    <button 
                      onClick={() => deleteShop(shop.id)}
                      className="h-12 w-12 flex items-center justify-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive transition-all text-white active:scale-90"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
