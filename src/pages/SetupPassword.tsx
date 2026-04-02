import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Lock, UserPlus, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const SetupPassword = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchShop = async () => {
      const { data, error } = await supabase.from("shops").select("*").eq("id", shopId).single();
      if (error || !data) {
        toast.error("Invalid setup link or shop no longer exists.");
        navigate("/");
        return;
      }
      setShopName(data.shop_name);
      setEmail(data.owner_email);
      setLoading(false);
    };
    fetchShop();
  }, [shopId]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    // 1. Create the Auth User
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      toast.error(authError.message);
      setSubmitting(false);
      return;
    }

    // 2. Link the shop to this user and set status to active
    const { error: updateError } = await supabase
      .from("shops")
      .update({
        owner_id: authData.user?.id,
        status: "active"
      })
      .eq("id", shopId);

    if (updateError) {
      toast.error("User created but shop update failed. Contact admin.");
    } else {
      toast.success("Welcome! Your secure dashboard is now ready.");
      navigate(`/dashboard/${shopId}`);
    }
    setSubmitting(false);
  };

  if (loading) return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <Loader2 className="animate-spin text-primary/30" size={48} />
    </div>
  );

  return (
    <div className="min-h-svh flex items-center justify-center p-6 bg-background relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-grid-pattern opacity-[0.03]" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg relative z-10"
      >
        <div className="text-center mb-12">
           <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-indigo-500/5 rotate-3">
             <UserPlus className="text-indigo-500" size={40} />
           </div>
           <h1 className="text-5xl font-extrabold tracking-tighter mb-4">{shopName}</h1>
           <p className="text-muted-foreground font-light text-lg">Secure your station dashboard</p>
        </div>

        <form onSubmit={handleSetup} className="glass-panel p-12 space-y-8">
           <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Authorized Email</label>
              <input 
                disabled
                value={email}
                className="w-full bg-secondary/30 border border-border/50 rounded-2xl px-6 h-14 outline-none disabled:cursor-not-allowed opacity-60 font-mono text-sm"
              />
           </div>

           <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Set Your Private Key</label>
              <div className="relative">
                <input 
                  type="password"
                  required
                  autoFocus
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-secondary/50 border border-border/50 rounded-2xl px-6 h-14 outline-none focus:ring-4 ring-primary/5 focus:border-primary/20 transition-all font-medium text-lg tracking-[0.2em] placeholder:tracking-normal placeholder:font-normal"
                  placeholder="MIN. 8 CHARACTERS"
                />
                <Lock className="absolute right-5 top-4 text-muted-foreground/30" size={20} />
              </div>
              <p className="text-[9px] text-muted-foreground/50 font-bold uppercase tracking-widest mt-2 px-1">
                Use a strong combination for maximum vault security
              </p>
           </div>

           <button 
             disabled={submitting}
             className="w-full bg-primary text-primary-foreground h-16 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all hover:scale-[1.01] active:scale-95 shadow-xl shadow-primary/20"
           >
             {submitting ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
             FINISH ACCOUNT SETUP
           </button>
        </form>

        <p className="text-center mt-12 text-[10px] text-muted-foreground/40 font-bold uppercase tracking-[0.2em] max-w-[300px] mx-auto leading-relaxed">
          BY FINALIZING SETUP, YOU AGREE TO LOCAL-DEVICE MEMORY RETENTION POLICIES
        </p>
      </motion.div>
    </div>
  );
};

export default SetupPassword;
