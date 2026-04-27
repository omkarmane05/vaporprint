
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldCheck, Lock, Sparkles, Printer, CheckCircle, ArrowRight, Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ActivateShop = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [invite, setInvite] = useState<{ id: string; shop_id: string; shop_name: string; email: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");

  useEffect(() => {
    validateToken();
  }, [token]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Check for SIGNED_IN or INITIAL_SESSION (if they already confirmed in another tab)
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session && invite && !isSuccess) {
        // Double check this user email matches the invite email
        if (session.user.email === invite.email) {
          await tryActivate();
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [invite, isSuccess]);

  const validateToken = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("invitations")
        .select("*, shops(name)")
        .eq("token", token)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (error || !data) {
        toast.error("Invalid or expired invitation link.");
        navigate("/");
        return;
      }

      const shopData = data.shops as any;
      if (!shopData) {
        toast.error("Associated shop not found.");
        navigate("/");
        return;
      }

      setInvite({
        id: data.id,
        shop_id: data.shop_id,
        shop_name: shopData.name,
        email: data.email
      });
    } catch (err) {
      console.error("Token validation error:", err);
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const tryActivate = async () => {
    if (!invite || !token) return;

    try {
      const { error } = await supabase.rpc("activate_shop", {
        p_invitation_token: token,
        p_shop_id: invite.shop_id,
      });

      if (error) throw error;

      setIsSuccess(true);
      toast.success("Shop activated and secured!");
    } catch (err: any) {
      toast.error("Activation failed: " + (err.message || "Try again or contact Admin."));
    }
  };

  const handleActivate = async () => {
    if (!invite) return;

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    if (authMode === "signup" && password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setActivating(true);

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: invite.email,
          password: password,
        });

        if (error) {
          if (error.message.toLowerCase().includes("already registered") || error.message.toLowerCase().includes("already been registered")) {
            toast.error("This email already has an account. Please sign in instead.");
            setAuthMode("signin");
            setActivating(false);
            return;
          }
          throw error;
        }

        if (!data.session) {
          toast.info("Please check your email to confirm your account, then return to this page.");
          setActivating(false);
          // Show a "Resend" button after a few seconds if it hasn't arrived
          return;
        }

        // Session exists → activate immediately
        await tryActivate();
      } else {
        // Sign in for existing users
        const { error } = await supabase.auth.signInWithPassword({
          email: invite.email,
          password: password,
        });

        if (error) throw error;

        await tryActivate();
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed.");
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

        <section className="glass-panel p-8 space-y-6">
          {/* Auth mode tabs */}
          <div className="flex rounded-xl bg-secondary/50 p-1 gap-1">
            <button
              onClick={() => setAuthMode("signup")}
              className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold tracking-widest transition-all ${authMode === "signup" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              CREATE ACCOUNT
            </button>
            <button
              onClick={() => setAuthMode("signin")}
              className={`flex-1 py-2.5 rounded-lg text-[10px] font-bold tracking-widest transition-all ${authMode === "signin" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              SIGN IN
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
                <Mail size={12} /> EMAIL
              </label>
              <input
                type="email"
                value={invite?.email || ""}
                disabled
                className="w-full bg-secondary/30 border border-primary/10 rounded-2xl px-6 h-14 font-bold text-lg outline-none opacity-70 cursor-not-allowed"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
                <Lock size={12} /> {authMode === "signup" ? "CREATE PASSWORD" : "PASSWORD"}
              </label>
              <input
                type="password"
                placeholder="Min 8 characters..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-secondary/50 border border-primary/10 rounded-2xl px-6 h-14 font-bold text-lg outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all placeholder:font-medium placeholder:opacity-30"
                autoFocus
              />
            </div>

            {authMode === "signup" && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
                  <Lock size={12} /> CONFIRM PASSWORD
                </label>
                <input
                  type="password"
                  placeholder="Repeat password..."
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-secondary/50 border border-primary/10 rounded-2xl px-6 h-14 font-bold text-lg outline-none focus:ring-4 ring-primary/5 focus:border-primary/40 transition-all placeholder:font-medium placeholder:opacity-30"
                />
              </div>
            )}

            <p className="text-[10px] text-muted-foreground/60 leading-relaxed italic">
              {authMode === "signup"
                ? "This creates your secure account. You'll use these credentials to access your dashboard."
                : "Sign in with your existing account to activate this station."}
            </p>
          </div>

          <button
            onClick={handleActivate}
            disabled={activating || password.length < 8 || (authMode === "signup" && password !== confirmPassword)}
            className="w-full bg-primary text-primary-foreground h-16 rounded-[1.5rem] font-bold text-lg transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30 disabled:grayscale glow-pastel flex items-center justify-center gap-3"
          >
            {activating ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
            {activating ? "SECURING..." : "ACTIVATE PRINT STATION"}
          </button>

          {!activating && authMode === "signup" && (
            <div className="text-center">
              <button 
                onClick={() => {
                  setActivating(true);
                  handleActivate().finally(() => setActivating(false));
                }}
                className="text-[10px] font-bold text-primary hover:underline uppercase tracking-widest"
              >
                Didn't get the email? Try Resending
              </button>
            </div>
          )}
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
