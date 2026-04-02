import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Shield, Lock, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: { user }, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    if (user?.email === "omkarmane015@gmail.com") { // Your Admin Email
      navigate("/admin");
    } else {
      // Find their shop ID
      const { data: shop } = await supabase
        .from("shops")
        .select("id")
        .eq("owner_id", user?.id)
        .single();
      
      if (shop) {
        navigate(`/dashboard/${shop.id}`);
      } else {
        toast.error("No shop associated with this account.");
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-svh flex items-center justify-center p-6 bg-background overflow-hidden relative">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/5 rounded-full blur-[120px] animate-pulse delay-700" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-10">
          <div className="w-20 h-20 rounded-[2.5rem] bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-primary/5">
            <Shield className="text-primary" size={32} />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-2">Vapor Access</h1>
          <p className="text-muted-foreground font-light">Authorized Gateway Only</p>
        </div>

        <form onSubmit={handleLogin} className="glass-panel p-10 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Email Terminal</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-secondary/50 border border-border/50 rounded-2xl px-6 h-14 outline-none focus:ring-4 ring-primary/5 focus:border-primary/30 transition-all font-medium"
              placeholder="operator@vaporprint.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 ml-1">Secure Key</label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-secondary/50 border border-border/50 rounded-2xl px-6 h-14 outline-none focus:ring-4 ring-primary/5 focus:border-primary/30 transition-all font-medium"
                placeholder="••••••••"
              />
              <Lock className="absolute right-5 top-4 text-muted-foreground/30" size={20} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground h-16 rounded-2xl font-bold transition-all hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-3 shadow-xl shadow-primary/20 glow-pastel disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : "AUTHORIZE session"}
          </button>
        </form>

        <p className="text-center mt-12 text-[10px] text-muted-foreground/40 font-bold uppercase tracking-[0.3em]">
          End-to-End Encrypted Tunnel Active
        </p>
      </motion.div>
    </div>
  );
};

export default LoginPage;
