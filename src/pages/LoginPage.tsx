import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Mail, Lock, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Check if user is the global Admin or a Shop Owner
      // For now, we can check for a specific admin email or metadata
      const isAdmin = email === "omkarmane512@gmail.com"; // Replace with your actual admin email

      if (isAdmin) {
        toast.success("Welcome, Commander.");
        navigate("/admin");
      } else {
        // Fetch their shop slug to redirect correctly
        const { data: shopData } = await supabase
          .from("shops")
          .select("slug")
          .eq("owner_id", data.user.id)
          .single();

        toast.success("Station Authenticated.");
        if (shopData) {
          navigate(`/dashboard/${shopData.slug}`);
        } else {
          navigate("/"); // Fallback
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Invalid credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-svh flex items-center justify-center p-6 bg-background overflow-hidden relative">
      {/* Background Glows */}
      <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-10 md:p-16 max-w-lg w-full relative z-10"
      >
        <div className="text-center mb-10">
          <div className="w-20 h-20 rounded-3xl pastel-lavender flex items-center justify-center mb-8 mx-auto border border-primary/20 shadow-2xl shadow-primary/20 animate-float">
            <Shield className="text-primary" size={40} />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tighter mb-4">VaporHub Access</h1>
          <p className="text-muted-foreground font-light px-4">
            Enter your credentials to manage your station and documents.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-4">
            <div className="relative group">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
              <input
                type="email"
                placeholder="Manager Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-secondary/50 border border-border rounded-2xl pl-14 pr-6 h-16 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all"
                required
              />
            </div>
            <div className="relative group">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
              <input
                type="password"
                placeholder="Secret Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-secondary/50 border border-border rounded-2xl pl-14 pr-6 h-16 font-medium outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary text-primary-foreground h-16 rounded-2xl font-extrabold text-lg transition-all hover:brightness-110 active:scale-[0.98] shadow-2xl shadow-primary/20 glow-pastel flex items-center justify-center gap-3 mt-10 group"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              <>
                AUTHENTICATE STATION <ArrowRight className="group-hover:translate-x-1 transition-transform" size={20} />
              </>
            )}
          </button>
        </form>

        <p className="mt-12 text-center text-[10px] uppercase font-bold tracking-[.3em] text-muted-foreground/40">
          Transmissions Encrypted • VaporPrint Hub
        </p>
      </motion.div>
    </div>
  );
};

export default LoginPage;
