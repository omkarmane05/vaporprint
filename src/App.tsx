import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import Home from "./pages/Home";
import ShopDashboard from "./pages/ShopDashboard";
import CustomerUpload from "./pages/CustomerUpload";
import AdminDashboard from "./pages/AdminDashboard";
import LoginPage from "./pages/LoginPage";
import SetupPassword from "./pages/SetupPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Protected Route for Shop Owners & Admin
const ProtectedRoute = ({ children, isAdmin = false }: { children: React.ReactNode, isAdmin?: boolean }) => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
  }, []);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  
  if (isAdmin && session.user.email !== "omkarmane015@gmail.com") {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup/:shopId" element={<SetupPassword />} />
          
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute isAdmin={true}>
                <AdminDashboard />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/dashboard/:shopId" 
            element={
              <ProtectedRoute>
                <ShopDashboard />
              </ProtectedRoute>
            } 
          />
          
          <Route path="/upload/:shopId" element={<CustomerUpload />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
