import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Printer, Mail, Lock, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Account created! Check your email to verify.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back, Shopkeeper!");
        navigate("/");
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-svh flex items-center justify-center p-6 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-6 mx-auto bg-primary/10 border border-primary/20 glow-pastel">
            <Printer className="text-primary" size={28} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            {isSignUp ? "Join VaporPrint" : "Owner Login"}
          </h1>
          <p className="text-muted-foreground font-light text-sm">
            Manage your shop locations and print queues securely.
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-2">
            <div className="relative group">
              <Mail className="absolute left-4 top-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" size={18} />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-secondary/50 border border-border rounded-xl px-12 h-14 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all"
                required
              />
            </div>
            <div className="relative group">
              <Lock className="absolute left-4 top-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" size={18} />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-secondary/50 border border-border rounded-xl px-12 h-14 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground h-14 rounded-2xl font-bold transition-all hover:brightness-110 active:scale-[0.98] shadow-lg shadow-primary/20 glow-pastel flex items-center justify-center gap-3"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : (isSignUp ? "Create Account" : "Access Hub")}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-xs text-muted-foreground font-medium">
            {isSignUp ? "Already have an account?" : "New to the platform?"}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary ml-1 font-bold hover:underline"
            >
              {isSignUp ? "Log In" : "Sign Up"}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
