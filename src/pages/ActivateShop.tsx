
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Lock, Sparkles, Printer, CheckCircle, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ActivateShop = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [invite, setInvite] = useState<{ id: string; shop_id: string; shop_name: string; email: string } | null>(null);
  const [password, setPassword] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const validateToken = async () => {
      if (!token) return;

      try {
        const { data, error } = await supabase
          .from("invitations")
          .select("*, shops(name)")
          .eq("token", token)
          .single();

        if (error || !data) {
          toast.error("Invalid or expired invitation.");
          navigate("/");
          return;
        }

        setInvite({
          id: data.id,
          shop_id: data.shop_id,
          shop_name: data.shops.name,
          email: data.email
        });
      } catch (err) {
        console.error("[Activation Error]", err);
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    validateToken();
  }, [token, navigate]);

  const handleActivate = async () => {
    if (!password || !invite) return;
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setActivating(true);
    try {
      // 1. Update the Shop
      const { error: shopError } = await supabase
        .from("shops")
        .update({
          password: password,
          status: "active"
        })
        .eq("id", invite.shop_id);

      if (shopError) throw shopError;

      // 2. Clear the used invitation
      await supabase.from("invitations").delete().eq("id", invite.id);

      setIsSuccess(true);
      toast.success("Shop activated and secured!");
    } catch (err: any) {
      console.error("[Activation Failed]", err);
      toast.error("Activation failed. Try again or contact Admin.");
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  if (isSuccess && invite) {
    return (
      <div className="min-h-svh flex items-center justify-center p-6 bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md text-center space-y-10"
        >
          <div className="w-24 h-24 rounded-3xl pastel-mint flex items-center justify-center border border-success/20 mx-auto shadow-2xl shadow-success/10">
            <CheckCircle className="text-success" size={48} />
          </div>
          
          <div className="space-y-4">
            <h1 className="text-5xl font-extrabold tracking-tighter">Activated!</h1>
            <p className="text-muted-foreground font-light text-lg">
              Your station <span className="text-primary font-bold">{invite.shop_name}</span> is now live and secure.
            </p>
          </div>

          <button
            onClick={() => navigate(`/dashboard/${invite.shop_id}`)}
            className="w-full bg-primary text-primary-foreground h-16 rounded-[1.5rem] font-bold text-base transition-all hover:brightness-110 active:scale-[0.98] glow-pastel flex items-center justify-center gap-3"
          >
            ENTER DASHBOARD <ArrowRight size={20} />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-6 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-12"
      >
        <header className="text-center space-y-4">
          <div className="w-20 h-20 rounded-[2rem] bg-success/10 flex items-center justify-center border border-success/20 mx-auto">
            <Sparkles className="text-success" size={32} />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tighter italic">Initialize Station</h1>
          <p className="text-muted-foreground font-light text-lg tracking-tight">
            Setting up <span className="text-primary font-bold">{invite?.shop_name}</span>
          </p>
        </header>

        <section className="glass-panel p-8 space-y-8">
          <div className="space-y-4">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
              <Lock size={12} /> CREATE MASTER PASSWORD
            </label>
            <input
              type="password"
              placeholder="Min 6 characters..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-secondary/50 border border-primary/10 rounded-2xl px-6 h-16 font-bold text-lg outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all placeholder:font-medium placeholder:opacity-30"
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed italic">
              This password will be required every time you access your station dashboard.
            </p>
          </div>

          <button
            onClick={handleActivate}
            disabled={activating || password.length < 6}
            className="w-full bg-primary text-primary-foreground h-16 rounded-[1.5rem] font-bold text-lg transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30 disabled:grayscale glow-pastel flex items-center justify-center gap-3"
          >
            {activating ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
            {activating ? "SECURING PROTOCOLS..." : "ACTIVATE PRINT STATION"}
          </button>
        </section>

        <footer className="text-center opacity-30">
          <div className="flex items-center justify-center gap-2 text-[10px] font-bold tracking-widest uppercase">
            <Printer size={12} /> VaporPrint Core • Node {invite?.shop_id}
          </div>
        </footer>
      </motion.div>
    </div>
  );
};

export default ActivateShop;
