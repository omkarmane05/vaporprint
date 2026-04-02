import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Users, Shield, MapPin, Mail, Loader2, Signal, Trash2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [shops, setShops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  
  // Form State
  const [newShopName, setNewShopName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [location, setLocation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchShops();
  }, []);

  const fetchShops = async () => {
    const { data, error } = await supabase.from("shops").select("*").order('created_at', { ascending: false });
    if (!error) setShops(data || []);
    setLoading(false);
  };

  const handleDeleteShop = async (id: string) => {
    if (!confirm("Are you sure you want to vaporize this station? All data will be lost.")) return;
    
    const { error } = await supabase.from("shops").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete station.");
    } else {
      toast.success("Station vaporized successfully.");
      fetchShops();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
    toast.success("Safely logged out.");
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // 1. Create the permanent ID slug
      const slug = `${newShopName}-${location}`.toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 32) + "-" + Math.random().toString(36).substring(2, 6);
      const activationLink = `${window.location.origin}/setup-password?claim=${slug}`;

      // 2. Create the Shop entry in the Database
      const { error: shopError } = await supabase.from("shops").insert({
        name: newShopName,
        location: location,
        slug: slug
      });

      if (shopError) throw shopError;

      // 3. Draft the Professional Invitation Email
      const subject = encodeURIComponent(`Action Required: Activate your ${newShopName} Station`);
      const body = encodeURIComponent(
        `Hello,\n\nYou have been invited to manage a printing station at ${newShopName} (${location}).\n\n` +
        `To securely activate your station and set your manager password, please click the link below:\n\n` +
        `${activationLink}\n\n` +
        `Welcome to the VaporPrint network.\n\n` +
        `Regards,\nNetwork Administration`
      );

      // Open Native Email App
      window.location.href = `mailto:${ownerEmail}?subject=${subject}&body=${body}`;

      toast.success(`Station Initialized. Please send the drafted email.`);
      setIsInviteOpen(false);
      fetchShops();
    } catch (err: any) {
      toast.error(err.message || "Is the SQL Table created in Supabase?");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-svh bg-background p-6 md:p-12 lg:p-16">
      <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-end mb-16 gap-6">
        <div>
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 rounded-2xl pastel-lavender flex items-center justify-center border border-primary/20">
              <Shield className="text-primary" size={24} />
            </div>
            <h1 className="text-5xl font-extrabold tracking-tighter">Network Admin</h1>
          </div>
          <p className="text-muted-foreground font-light text-lg">
            Propel your printing network. Manage <span className="text-primary font-bold">{shops.length} branches</span> across your organization.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={handleLogout}
            className="h-14 px-6 rounded-2xl font-bold flex items-center gap-3 transition-all hover:bg-destructive/10 hover:text-destructive text-muted-foreground border border-border/50"
          >
            <LogOut size={20} />
          </button>
          
          <button
            onClick={() => setIsInviteOpen(true)}
            className="bg-primary text-primary-foreground h-14 px-8 rounded-2xl font-bold flex items-center gap-3 transition-all hover:brightness-110 active:scale-95 shadow-xl shadow-primary/20 glow-pastel"
          >
            <Plus size={20} /> ONBOARD NEW BRANCH
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto space-y-6">
        {loading ? (
          <div className="py-20 text-center">
            <Loader2 className="animate-spin mx-auto text-primary/30" size={40} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {shops.map(shop => (
              <motion.div
                key={shop.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel p-8 hover:shadow-2xl hover:shadow-primary/5 transition-all group"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
                    <Signal className="text-success animate-pulse" size={20} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-success/10 text-success text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest border border-success/20">
                      Active Hub
                    </div>
                    <button 
                      onClick={() => handleDeleteShop(shop.id)}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                
                <h3 className="text-xl font-bold mb-1">{shop.name}</h3>
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-4">
                  <MapPin size={14} className="text-primary/50" /> {shop.location}
                </div>
                
                <div className="space-y-3 pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground/60">
                    <span>STATION ID</span>
                    <span className="text-foreground">{shop.slug}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button 
                      onClick={() => navigate(`/dashboard/${shop.slug}`)}
                      className="py-3 bg-secondary/50 rounded-xl text-[10px] font-bold border border-border/50 hover:bg-primary/10 hover:border-primary/30 transition-all uppercase"
                    >
                      View Live
                    </button>
                    <button 
                      onClick={() => {
                        const link = `${window.location.origin}/setup-password?claim=${shop.slug}`;
                        navigator.clipboard.writeText(link);
                        toast.success("Branch Activation link copied!");
                      }}
                      className="py-3 bg-primary/10 text-primary rounded-xl text-[10px] font-bold hover:bg-primary/20 transition-all uppercase flex items-center justify-center gap-1.5"
                    >
                      Copy Invite
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* Invite Modal */}
      <AnimatePresence>
        {isInviteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-panel p-10 max-w-md w-full border-primary/20 shadow-2xl relative"
            >
              <button 
                onClick={() => setIsInviteOpen(false)}
                className="absolute top-6 right-6 text-muted-foreground hover:text-foreground transition-all"
              >
                ✕
              </button>
              
              <div className="w-16 h-16 rounded-2xl pastel-sky flex items-center justify-center mb-8 border border-primary/20">
                <Users className="text-primary" size={32} />
              </div>
              
              <h2 className="text-3xl font-extrabold tracking-tighter mb-2">Onboard Branch</h2>
              <p className="text-muted-foreground text-sm mb-8">Send an encrypted invite link to the branch operator.</p>
              
              <form onSubmit={handleInvite} className="space-y-4">
                <input
                  type="text"
                  placeholder="Branch Name (e.g. Times Square Hub)"
                  value={newShopName}
                  onChange={e => setNewShopName(e.target.value)}
                  className="w-full bg-secondary/50 border border-border rounded-xl px-5 h-14 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all shadow-inner"
                  required
                />
                <input
                  type="text"
                  placeholder="Street / City Location"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="w-full bg-secondary/50 border border-border rounded-xl px-5 h-14 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all shadow-inner"
                  required
                />
                <div className="relative">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input
                    type="email"
                    placeholder="Operator Email"
                    value={ownerEmail}
                    onChange={e => setOwnerEmail(e.target.value)}
                    className="w-full bg-secondary/50 border border-border rounded-xl pl-12 pr-5 h-14 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all shadow-inner"
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-primary text-primary-foreground h-16 rounded-2xl font-bold text-lg transition-all hover:brightness-110 active:scale-[0.98] mt-6 flex items-center justify-center gap-3 shadow-xl shadow-primary/20"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : "GENERATE ENCRYPTED INVITE"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDashboard;
