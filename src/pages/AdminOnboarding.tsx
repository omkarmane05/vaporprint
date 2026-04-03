
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Mail, Building, Copy, Shield, Sparkles, LayoutGrid, Radio, Trash2, Loader2, X, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const AdminOnboarding = () => {
  const navigate = useNavigate();
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [shops, setShops] = useState<any[]>([]);
  const [isLoadingShops, setIsLoadingShops] = useState(true);
  const [showOnboard, setShowOnboard] = useState(false);

  // Onboarding Form States
  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastInvite, setLastInvite] = useState<{ name: string; url: string } | null>(null);

  useEffect(() => {
    // Check local session for admin
    const session = localStorage.getItem("vprint_admin_session");
    if (session === "omkar05") setIsAdminAuth(true);
  }, []);

  useEffect(() => {
    if (isAdminAuth) {
      fetchShops();
    }
  }, [isAdminAuth]);

  const fetchShops = async () => {
    setIsLoadingShops(true);
    const { data, error } = await supabase
      .from("shops")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setShops(data);
    setIsLoadingShops(false);
  };

  const verifyAdmin = () => {
    if (adminPass === "omkar05") {
      setIsLoggingIn(true);
      setTimeout(() => {
        setIsAdminAuth(true);
        localStorage.setItem("vprint_admin_session", "omkar05");
        toast.success("Master Admin Access Granted");
      }, 800);
    } else {
      toast.error("Invalid Master Password");
    }
  };

  const generateInvite = async () => {
    if (!shopName || !email) {
      toast.error("Please provide both name and email.");
      return;
    }

    setLoading(true);
    // Generate a unique ID (the shop's slug)
    const baseSlug = shopName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const shopId = `vprint-${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
    const inviteToken = crypto.randomUUID();
    const activationUrl = `${window.location.origin}/activate/${inviteToken}`;

    try {
      // 1. Create the Shop
      const { error: shopError } = await supabase.from("shops").insert({
        id: shopId,
        name: shopName,
        owner_email: email,
        status: "pending"
      });

      if (shopError) throw shopError;

      // 2. Create the Invitation
      const { error: inviteError } = await supabase.from("invitations").insert({
        shop_id: shopId,
        email: email,
        token: inviteToken
      });

      if (inviteError) throw inviteError;

      setLastInvite({ name: shopName, url: activationUrl });
      toast.success(`Invite generated for ${shopName}!`);
      setShopName("");
      setEmail("");
      fetchShops(); // Refresh the list
    } catch (err: any) {
      console.error("[SaaS Admin Error]", err);
      toast.error("Failed to generate invite. Check DB permissions.");
    } finally {
      setLoading(false);
    }
  };

  const deleteShop = async (id: string) => {
    const { error } = await supabase.from("shops").delete().eq("id", id);
    if (error) toast.error("Failed to delete shop.");
    else {
      toast.success("Shop vaporized.");
      fetchShops();
    }
  };

  if (!isAdminAuth) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md glass-panel p-10 text-center space-y-10"
        >
          <div className="w-20 h-20 rounded-[2rem] bg-primary/10 flex items-center justify-center border border-primary/20 mx-auto glow-pastel">
            <Lock className="text-primary" size={32} />
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-extrabold tracking-tighter italic">ADMIN GATEWAY</h1>
            <p className="text-muted-foreground text-sm font-light uppercase tracking-widest">Protocol Check Required</p>
          </div>
          <input
            type="password"
            placeholder="Protocol Password"
            value={adminPass}
            onChange={(e) => setAdminPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verifyAdmin()}
            className="w-full bg-secondary/50 border border-primary/10 rounded-2xl px-6 h-14 font-bold text-lg text-center outline-none focus:ring-4 ring-primary/5 transition-all"
            autoFocus
          />
          <button
            onClick={verifyAdmin}
            disabled={isLoggingIn || !adminPass}
            className="w-full bg-primary text-primary-foreground h-14 rounded-2xl font-bold transition-all hover:brightness-110 active:scale-95 flex items-center justify-center gap-3 shadow-xl"
          >
            {isLoggingIn ? <Loader2 className="animate-spin" size={20} /> : "ACCESS TERMINAL"}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background p-6 md:p-12 lg:p-16">
      <div className="max-w-7xl mx-auto space-y-12">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-border pb-12">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl pastel-lavender flex items-center justify-center border border-primary/20">
                <Shield className="text-primary" size={24} />
              </div>
              <h1 className="text-5xl font-extrabold tracking-tighter">Controller</h1>
            </div>
            <p className="text-muted-foreground font-light text-lg tracking-tight italic">
              Logged in as Master Admin • Protocol 05
            </p>
          </div>
          
          <button
            onClick={() => setShowOnboard(true)}
            className="bg-primary text-primary-foreground px-8 py-4 rounded-2xl font-bold transition-all hover:brightness-110 active:scale-95 shadow-xl shadow-primary/20 flex items-center gap-3"
          >
            <Plus size={20} /> INITIATE ONBOARDING
          </button>
        </header>

        {/* Shops Grid */}
        <div className="grid gap-6">
           <div className="flex items-center justify-between mb-2 px-2">
             <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground/60 flex items-center gap-3">
               <Radio size={12} className="text-primary animate-pulse" /> LIVE STATIONS
             </h2>
           </div>

           {isLoadingShops ? (
             <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-primary/40" size={48} /></div>
           ) : shops.length === 0 ? (
             <div className="py-32 text-center glass-panel opacity-40">
                <LayoutGrid className="mx-auto mb-6 text-muted-foreground/20" size={48} />
                <p className="text-lg font-medium text-muted-foreground">No stations active on your protocol.</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               <AnimatePresence>
                 {shops.map((shop) => (
                   <motion.div
                     key={shop.id}
                     layout
                     initial={{ opacity: 0, scale: 0.95 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0.95 }}
                     className="glass-panel p-8 space-y-6 hover:shadow-2xl transition-all border-primary/5 hover:border-primary/20"
                   >
                     <div className="flex items-start justify-between">
                       <div className="space-y-2">
                         <h3 className="text-xl font-bold tracking-tight">{shop.name}</h3>
                         <p className="text-[10px] font-mono text-muted-foreground/60 truncate max-w-[200px]">{shop.id}</p>
                       </div>
                       <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${shop.status === 'active' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                         {shop.status}
                       </div>
                     </div>
                     <div className="pt-6 border-t border-border/50 flex justify-between items-center">
                       <button 
                         onClick={() => navigate(`/dashboard/${shop.id}`)}
                         className="text-[10px] font-bold tracking-widest text-primary hover:tracking-[0.2em] transition-all"
                       >
                         OPEN DASHBOARD
                       </button>
                       <button 
                         onClick={() => deleteShop(shop.id)}
                         className="p-2 text-muted-foreground hover:text-destructive transition-all"
                       >
                         <Trash2 size={16} />
                       </button>
                     </div>
                   </motion.div>
                 ))}
               </AnimatePresence>
             </div>
           )}
        </div>

        {/* Onboarding Overlay */}
        <AnimatePresence>
          {showOnboard && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowOnboard(false)}
                className="absolute inset-0 bg-background/80 backdrop-blur-xl"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 30 }}
                className="w-full max-w-xl glass-panel p-10 md:p-12 space-y-12 relative z-50 border-primary/20"
              >
                <div className="flex justify-between items-center">
                  <div className="space-y-2">
                    <h2 className="text-4xl font-extrabold tracking-tighter italic">New Station</h2>
                    <p className="text-muted-foreground font-light">Issue a protocol invitation link</p>
                  </div>
                  <button onClick={() => setShowOnboard(false)} className="p-2 hover:bg-secondary rounded-xl transition-all">
                    <X />
                  </button>
                </div>

                <div className="space-y-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
                      <Building size={12} /> SHOP NAME
                    </label>
                    <input
                      type="text"
                      placeholder="High-end Printing Hub..."
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      className="w-full bg-secondary/50 border border-primary/10 rounded-2xl px-6 h-16 font-bold text-lg outline-none focus:ring-4 ring-primary/5 transition-all"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
                      <Mail size={12} /> OWNER EMAIL
                    </label>
                    <input
                      type="email"
                      placeholder="owner@vaporprint.io"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-secondary/50 border border-primary/10 rounded-2xl px-6 h-16 font-bold text-lg outline-none focus:ring-4 ring-primary/5 transition-all"
                    />
                  </div>
                  <button
                    onClick={generateInvite}
                    disabled={loading || !shopName || !email}
                    className="w-full bg-primary text-primary-foreground h-16 rounded-[1.5rem] font-bold text-base transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-3"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                    {loading ? "VAPORIZING DATA..." : "GENERATE PROTOCOL LINK"}
                  </button>
                </div>

                {lastInvite && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 bg-success/10 rounded-2xl border border-success/20 flex flex-col sm:flex-row items-center justify-between gap-6"
                  >
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-success uppercase tracking-widest">ACTIVATION LINK CREATED</p>
                      <p className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">{lastInvite.url}</p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(lastInvite.url);
                        toast.success("Copied to clipboard!");
                      }}
                      className="px-6 py-3 bg-success text-success-foreground rounded-xl font-bold text-[10px] tracking-widest hover:brightness-105"
                    >
                      COPY NOW
                    </button>
                  </motion.div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
};

export default AdminOnboarding;
