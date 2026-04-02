import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Printer, Shield, Globe, MapPin, Plus, Trash2, Mail, 
  Loader2, ArrowLeft, LayoutDashboard, Database, UserPlus, Link2, Copy 
} from "lucide-react";
import { 
  getAllNetworkShops, provisionShop, decommissionShop, 
  Shop, ADMIN_EMAIL 
} from "@/lib/shops";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // New Shop Form State
  const [newName, setNewName] = useState("");
  const [newLoc, setNewLoc] = useState("");
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    checkAdminAndFetch();
  }, []);

  const checkAdminAndFetch = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email !== ADMIN_EMAIL) {
      toast.error("Restricted Area: Super-Admin credentials required.");
      navigate("/");
      return;
    }
    fetchShops();
  };

  const fetchShops = async () => {
    try {
      const data = await getAllNetworkShops();
      setShops(data);
    } catch (err) {
      toast.error("Failed to load network data.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await provisionShop(newName, newLoc, newEmail);
      toast.success(`Hub Provisioned: ${newName}`);
      setNewName(""); setNewLoc(""); setNewEmail("");
      setShowAdd(false);
      fetchShops();
    } catch (err) {
      toast.error("Provisioning failed. Check DB rules.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyInviteLink = (shop: Shop) => {
    const inviteUrl = `${window.location.origin}/dashboard/${shop.id}?name=${encodeURIComponent(shop.name)}&loc=${encodeURIComponent(shop.location)}`;
    navigator.clipboard.writeText(inviteUrl);
    toast.success(`Invite Link Copied: ${shop.name}`);
  };

  const handleDeleteShop = async (id: string, name: string) => {
    if (!confirm(`Confirm Decommission: ${name}? This action is permanent.`)) return;
    try {
      await decommissionShop(id);
      toast.success("Branch Decommissioned Successfully.");
      fetchShops();
    } catch (err) {
      toast.error("Decommission failed.");
    }
  };

  if (loading) return (
    <div className="min-h-svh flex items-center justify-center">
       <Loader2 className="animate-spin text-primary" size={32} />
    </div>
  );

  return (
    <div className="min-h-svh bg-background p-6 lg:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-12 gap-6">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => navigate("/")}
              className="p-3 bg-secondary rounded-xl hover:bg-secondary/80 transition-all text-muted-foreground"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                 <Shield size={14} className="text-primary" />
                 <h2 className="text-[10px] font-bold uppercase tracking-[.3em] text-muted-foreground/60">VaporPrint Network Manager</h2>
              </div>
              <h1 className="text-4xl font-extrabold tracking-tighter">Super-Admin Hub</h1>
            </div>
          </div>
          
          <button 
            onClick={() => setShowAdd(!showAdd)}
            className="bg-primary text-primary-foreground px-8 py-4 rounded-2xl font-bold transition-all hover:scale-105 active:scale-95 shadow-xl shadow-primary/20 flex items-center gap-2"
          >
            {showAdd ? "CLOSE" : <><Plus size={20} /> PROVISION NEW HUB</>}
          </button>
        </header>

        <main className="grid lg:grid-cols-[1fr_350px] gap-12 items-start">
          <div className="space-y-6">
            <AnimatePresence>
              {showAdd && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mb-8"
                >
                  <form onSubmit={handleAddShop} className="glass-panel p-8 bg-primary/[0.02] border-primary/20 space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="relative group">
                         <Printer className="absolute left-4 top-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" size={18} />
                         <input
                           type="text" placeholder="Branch Name" value={newName} onChange={(e) => setNewName(e.target.value)}
                           className="w-full bg-secondary/50 border border-border rounded-xl px-12 h-14 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all"
                           required
                         />
                      </div>
                      <div className="relative group">
                         <MapPin className="absolute left-4 top-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" size={18} />
                         <input
                           type="text" placeholder="Location" value={newLoc} onChange={(e) => setNewLoc(e.target.value)}
                           className="w-full bg-secondary/50 border border-border rounded-xl px-12 h-14 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all"
                           required
                         />
                      </div>
                    </div>
                    <div className="relative group">
                       <Mail className="absolute left-4 top-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" size={18} />
                       <input
                         type="email" placeholder="Owner Email address" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                         className="w-full bg-secondary/50 border border-border rounded-xl px-12 h-14 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all"
                         required
                       />
                    </div>
                    <button
                      type="submit" disabled={submitting}
                      className="w-full bg-primary text-primary-foreground h-16 rounded-2xl font-bold text-lg transition-all hover:brightness-110 active:scale-[0.98] shadow-lg shadow-primary/20 flex items-center justify-center gap-3"
                    >
                      {submitting ? <Loader2 className="animate-spin" size={24} /> : <><UserPlus size={20} /> INITIALIZE NETWORK NODE</>}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-3 mb-6 px-2">
               <Database size={16} className="text-primary/40" />
               <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground/60">Live Network: {shops.length} Active Nodes</h2>
            </div>

            <div className="grid gap-4">
              {shops.map((shop, i) => (
                <motion.div
                  key={shop.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-panel p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 hover:shadow-xl hover:shadow-primary/[0.02] transition-all border-border/40"
                >
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center text-primary/40 border border-border flex-shrink-0">
                       <Printer size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-xl mb-1">{shop.name}</h3>
                      <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                        <span className="flex items-center gap-1 uppercase tracking-widest"><MapPin size={10} className="text-primary/40" /> {shop.location}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-border" />
                        <span className="flex items-center gap-1 font-mono">{shop.owner_email}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => copyInviteLink(shop)}
                      className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-primary/20 transition-all active:scale-95 border border-primary/20"
                      title="Copy Invite Link for Owner"
                    >
                      <Link2 size={14} /> COPY INVITE
                    </button>
                    <button 
                      onClick={() => handleDeleteShop(shop.id, shop.name)}
                      className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all active:scale-90"
                      title="Decommission Branch"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <aside className="space-y-8 h-full">
            <div className="glass-panel p-8 h-full bg-primary/[0.01]">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground/60 mb-8 border-b pb-4">
                Network Status
              </h2>
              <div className="space-y-8 font-medium">
                <div>
                   <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mb-2">Primary Relay</p>
                   <p className="text-lg text-primary">SUPABASE GLOBAL</p>
                </div>
                <div>
                   <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mb-2">Auth Provider</p>
                   <p className="text-lg text-primary">SUPABASE AUTH</p>
                </div>
                <div>
                   <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mb-2">Signaling Protocol</p>
                   <p className="text-lg text-primary">PEERJS WEBRTC</p>
                </div>
                <div className="pt-8 border-t">
                   <div className="flex items-center gap-3 text-success text-xs font-bold mb-3">
                      <div className="w-2 h-2 rounded-full bg-success animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                      SYSTEMS OPERATIONAL
                   </div>
                   <p className="text-xs text-muted-foreground leading-relaxed">All network nodes are syncing metadata and processing ephemeral buffers.</p>
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
