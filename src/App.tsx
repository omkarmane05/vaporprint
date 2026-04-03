import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "./pages/Home";
import ShopDashboard from "./pages/ShopDashboard";
import CustomerUpload from "./pages/CustomerUpload";
import AdminOnboarding from "./pages/AdminOnboarding";
import ActivateShop from "./pages/ActivateShop";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard/:shopId" element={<ShopDashboard />} />
          <Route path="/upload/:shopId" element={<CustomerUpload />} />
          <Route path="/admin/onboarding" element={<AdminOnboarding />} />
          <Route path="/activate/:token" element={<ActivateShop />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
