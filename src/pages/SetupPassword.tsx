import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Lock, Mail, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SetupPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const claimSlug = searchParams.get("claim");
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setIsLoading(true);

    try {
      // 1. Create the new User Account
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) throw signUpError;
      if (!authData.user) throw new Error("Connection failed. Try again.");

      // 2. If this is a station activation, link the Owner ID to the Shop
      if (claimSlug) {
        const { error: linkError } = await supabase
          .from("shops")
          .update({ owner_id: authData.user.id })
          .eq("slug", claimSlug);
          
        if (linkError) throw linkError;
      }

      setIsSuccess(true);
      toast.success("Station activated successfully!");
      
      setTimeout(() => {
        navigate("/login");
      }, 3000);
      
    } catch (err: any) {
      toast.error(err.message || "Failed to set password.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-svh flex items-center justify-center p-6 bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-16 text-center max-w-sm w-full"
        >
          <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mb-8 mx-auto border border-success/20">
            <CheckCircle2 className="text-success" size={40} />
          </div>
          <h2 className="text-3xl font-bold mb-4">You're All Set!</h2>
          <p className="text-muted-foreground text-sm mb-8">
            Your Station account is now linked. Redirecting to the login hub...
          </p>
          <div className="flex justify-center">
             <Loader2 className="animate-spin text-primary/30" size={24} />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-6 bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-10 md:p-16 max-w-lg w-full relative z-10"
      >
        <div className="text-center mb-10">
          <div className="w-20 h-20 rounded-3xl pastel-mint flex items-center justify-center mb-8 mx-auto border border-primary/20 shadow-xl shadow-success/10 animate-float">
            <Lock className="text-primary" size={40} />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tighter mb-4">Claim Your Station</h1>
          <p className="text-muted-foreground font-light px-4">
            Initialize your permanent station account to start receiving secure prints. {claimSlug && <span className="text-primary font-bold block mt-2 text-xs">ACTIIVATING BRANCH: {claimSlug}</span>}
          </p>
        </div>

        <form onSubmit={handleSetup} className="space-y-4">
          <div className="relative group">
            <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
            <input
              type="email"
              placeholder="Your Manager Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-2xl pl-14 pr-6 h-16 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all shadow-inner"
              required
            />
          </div>
          <div className="relative group">
            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
            <input
              type="password"
              placeholder="Create Secret Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-2xl pl-14 pr-6 h-16 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all shadow-inner"
              required
            />
          </div>
          <div className="relative group">
            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-2xl pl-14 pr-6 h-16 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all shadow-inner"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary text-primary-foreground h-16 rounded-2xl font-extrabold text-lg transition-all hover:brightness-110 active:scale-[0.98] shadow-2xl shadow-primary/20 glow-pastel flex items-center justify-center gap-3 mt-8"
          >
            {isLoading ? <Loader2 className="animate-spin" size={24} /> : "FINALIZE STATION ACCOUNT"}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default SetupPassword;
