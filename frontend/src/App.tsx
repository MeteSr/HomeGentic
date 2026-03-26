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
import MarketIntelligencePage from "@/pages/MarketIntelligencePage";
import ReportPage from "@/pages/ReportPage";
import PredictiveMaintenancePage from "@/pages/PredictiveMaintenancePage";
import PropertyVerifyPage from "@/pages/PropertyVerifyPage";
import AdminDashboardPage from "@/pages/AdminDashboardPage";
import OnboardingPage from "@/pages/OnboardingPage";
import SystemAgesPage from "@/pages/SystemAgesPage";

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
            borderRadius: "0.75rem",
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
        {/* Public — no auth required */}
        <Route path="/report/:token" element={<ReportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
