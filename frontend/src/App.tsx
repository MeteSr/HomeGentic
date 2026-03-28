import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";

import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import PropertyDetailPage from "@/pages/PropertyDetailPage";
import PropertyRegisterPage from "@/pages/PropertyRegisterPage";
import JobCreatePage from "@/pages/JobCreatePage";
import QuoteRequestPage from "@/pages/QuoteRequestPage";
import QuoteDetailPage from "@/pages/QuoteDetailPage";
import SettingsPage from "@/pages/SettingsPage";
import PricingPage from "@/pages/PricingPage";
import ContractorDashboardPage from "@/pages/ContractorDashboardPage";
import ContractorProfilePage from "@/pages/ContractorProfilePage";
import ContractorPublicPage from "@/pages/ContractorPublicPage";
import ContractorBrowsePage from "@/pages/ContractorBrowsePage";
import MarketIntelligencePage from "@/pages/MarketIntelligencePage";
import ReportPage from "@/pages/ReportPage";
import BadgePage from "@/pages/BadgePage";
import ScoreCertPage from "@/pages/ScoreCertPage";
import PredictiveMaintenancePage from "@/pages/PredictiveMaintenancePage";
import PropertyVerifyPage from "@/pages/PropertyVerifyPage";
import AdminDashboardPage from "@/pages/AdminDashboardPage";
import OnboardingPage from "@/pages/OnboardingPage";
import AgentDashboardPage from "@/pages/AgentDashboardPage";
import SystemAgesPage from "@/pages/SystemAgesPage";
import SensorPage from "@/pages/SensorPage";
import WarrantyWalletPage from "@/pages/WarrantyWalletPage";
import InsuranceDefensePage from "@/pages/InsuranceDefensePage";
import ResaleReadyPage from "@/pages/ResaleReadyPage";
import RecurringServiceCreatePage from "@/pages/RecurringServiceCreatePage";
import RecurringServiceDetailPage from "@/pages/RecurringServiceDetailPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f9fafb",
        }}
      >
        <div className="spinner-lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            borderRadius: 0,
            fontSize: "0.875rem",
            fontWeight: 500,
          },
        }}
      />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route
          path="/register"
          element={
            <ProtectedRoute>
              <RegisterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contractor-dashboard"
          element={
            <ProtectedRoute>
              <ContractorDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contractors"
          element={
            <ProtectedRoute>
              <ContractorBrowsePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contractor/:id"
          element={
            <ProtectedRoute>
              <ContractorPublicPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contractor/profile"
          element={
            <ProtectedRoute>
              <ContractorProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/properties/new"
          element={
            <ProtectedRoute>
              <PropertyRegisterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/properties/:id"
          element={
            <ProtectedRoute>
              <PropertyDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/properties/:id/verify"
          element={
            <ProtectedRoute>
              <PropertyVerifyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/properties/:id/systems"
          element={
            <ProtectedRoute>
              <SystemAgesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/new"
          element={
            <ProtectedRoute>
              <JobCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotes/new"
          element={
            <ProtectedRoute>
              <QuoteRequestPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotes/:id"
          element={
            <ProtectedRoute>
              <QuoteDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/market"
          element={
            <ProtectedRoute>
              <MarketIntelligencePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance"
          element={
            <ProtectedRoute>
              <PredictiveMaintenancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agent-dashboard"
          element={
            <ProtectedRoute>
              <AgentDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sensors"
          element={
            <ProtectedRoute>
              <SensorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/warranties"
          element={
            <ProtectedRoute>
              <WarrantyWalletPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/insurance-defense"
          element={
            <ProtectedRoute>
              <InsuranceDefensePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/resale-ready"
          element={
            <ProtectedRoute>
              <ResaleReadyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/recurring/new"
          element={
            <ProtectedRoute>
              <RecurringServiceCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/recurring/:id"
          element={
            <ProtectedRoute>
              <RecurringServiceDetailPage />
            </ProtectedRoute>
          }
        />
        {/* Public — no auth required */}
        <Route path="/report/:token" element={<ReportPage />} />
        <Route path="/badge/:token"  element={<BadgePage />} />
        <Route path="/cert/:token"   element={<ScoreCertPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
