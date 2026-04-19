import React, { Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Critical path — kept static (first paint)
import LandingPage           from "@/pages/LandingPage";
import LoginPage             from "@/pages/LoginPage";
import PricingPage           from "@/pages/PricingPage";
import PrivacyPolicyPage     from "@/pages/PrivacyPolicyPage";
import TermsOfServicePage    from "@/pages/TermsOfServicePage";
import SupportPage           from "@/pages/SupportPage";
import FAQPage               from "@/pages/FAQPage";
import GiftPage              from "@/pages/GiftPage";
import ContractorVerifyPage  from "@/pages/ContractorVerifyPage";
import PaymentSuccessPage    from "@/pages/PaymentSuccessPage";
import PaymentFailurePage    from "@/pages/PaymentFailurePage";

// All other pages lazy-loaded (split into separate chunks)
const RegisterPage               = React.lazy(() => import("@/pages/RegisterPage"));
const DashboardPage              = React.lazy(() => import("@/pages/DashboardPage"));
const PropertyDetailPage         = React.lazy(() => import("@/pages/PropertyDetailPage"));
const PropertyRegisterPage       = React.lazy(() => import("@/pages/PropertyRegisterPage"));
const PropertyVerifyPage         = React.lazy(() => import("@/pages/PropertyVerifyPage"));
const SystemAgesPage             = React.lazy(() => import("@/pages/SystemAgesPage"));
const JobCreatePage              = React.lazy(() => import("@/pages/JobCreatePage"));
const QuoteRequestPage           = React.lazy(() => import("@/pages/QuoteRequestPage"));
const QuoteDetailPage            = React.lazy(() => import("@/pages/QuoteDetailPage"));
const SettingsPage               = React.lazy(() => import("@/pages/SettingsPage"));
const ContractorDashboardPage    = React.lazy(() => import("@/pages/ContractorDashboardPage"));
const ContractorProfilePage      = React.lazy(() => import("@/pages/ContractorProfilePage"));
const ContractorPublicPage       = React.lazy(() => import("@/pages/ContractorPublicPage"));
const ContractorBrowsePage       = React.lazy(() => import("@/pages/ContractorBrowsePage"));
const MarketIntelligencePage     = React.lazy(() => import("@/pages/MarketIntelligencePage"));
const ReportPage                 = React.lazy(() => import("@/pages/ReportPage"));
const BadgePage                  = React.lazy(() => import("@/pages/BadgePage"));
const ScoreCertPage              = React.lazy(() => import("@/pages/ScoreCertPage"));
const PredictiveMaintenancePage  = React.lazy(() => import("@/pages/PredictiveMaintenancePage"));
const AdminDashboardPage         = React.lazy(() => import("@/pages/AdminDashboardPage"));
const OnboardingWizard           = React.lazy(() => import("@/pages/OnboardingWizard"));
const AgentDashboardPage         = React.lazy(() => import("@/pages/AgentDashboardPage"));
const SensorPage                 = React.lazy(() => import("@/pages/SensorPage"));
const WarrantyWalletPage         = React.lazy(() => import("@/pages/WarrantyWalletPage"));
const InsuranceDefensePage       = React.lazy(() => import("@/pages/InsuranceDefensePage"));
const ResaleReadyPage            = React.lazy(() => import("@/pages/ResaleReadyPage"));
const RecurringServiceCreatePage = React.lazy(() => import("@/pages/RecurringServiceCreatePage"));
const RecurringServiceDetailPage = React.lazy(() => import("@/pages/RecurringServiceDetailPage"));
// NeighborhoodHealthPage intentionally not routed — page kept for future re-enable
// const NeighborhoodHealthPage  = React.lazy(() => import("@/pages/NeighborhoodHealthPage"));
const ListingNewPage             = React.lazy(() => import("@/pages/ListingNewPage"));
const ListingDetailPage          = React.lazy(() => import("@/pages/ListingDetailPage"));
const AgentMarketplacePage       = React.lazy(() => import("@/pages/AgentMarketplacePage"));
const AgentProfileEditPage       = React.lazy(() => import("@/pages/AgentProfileEditPage"));
const AgentPublicPage            = React.lazy(() => import("@/pages/AgentPublicPage"));
const AgentBrowsePage            = React.lazy(() => import("@/pages/AgentBrowsePage"));
const FsboListingPage            = React.lazy(() => import("@/pages/FsboListingPage"));
const FsboSearchPage             = React.lazy(() => import("@/pages/FsboSearchPage"));
const FsboListingManagerPage     = React.lazy(() => import("@/pages/FsboListingManagerPage"));
const HomeSystemsEstimatorPage   = React.lazy(() => import("@/pages/HomeSystemsEstimatorPage"));
const CheckAddressPage           = React.lazy(() => import("@/pages/CheckAddressPage"));
const PriceLookupPage            = React.lazy(() => import("@/pages/PriceLookupPage"));
const InstantForecastPage        = React.lazy(() => import("@/pages/InstantForecastPage"));
const CheckoutPage               = React.lazy(() => import("@/pages/CheckoutPage"));
const PropertyTransferClaimPage  = React.lazy(() => import("@/pages/PropertyTransferClaimPage"));
const PropertyManagerClaimPage   = React.lazy(() => import("@/pages/PropertyManagerClaimPage"));
const DemoPage                   = React.lazy(() => import("@/pages/DemoPage"));
const BuyersTruthKitPage         = React.lazy(() => import("@/pages/BuyersTruthKitPage"));

const PageLoader = () => (
  <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#F4F1EB" }}>
    <div className="spinner-lg" />
  </div>
);

/**
 * Resets the per-route ErrorBoundary whenever the URL changes so a user
 * navigating away from a broken page gets a fresh render on the next route.
 */
function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      {children}
    </ErrorBoundary>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary global>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { borderRadius: 0, fontSize: "0.875rem", fontWeight: 500 },
          }}
        />
        <Suspense fallback={<PageLoader />}>
          <RouteErrorBoundary>
            <Routes>
          <Route path="/"            element={<LandingPage />} />
          <Route path="/login"       element={<LoginPage />} />
          <Route path="/pricing"     element={<PricingPage />} />
          <Route path="/privacy"     element={<PrivacyPolicyPage />} />
          <Route path="/terms"       element={<TermsOfServicePage />} />
          <Route path="/support"     element={<SupportPage />} />
          <Route path="/faq"         element={<FAQPage />} />
          <Route path="/gift"             element={<GiftPage />} />
          <Route path="/payment-success" element={<PaymentSuccessPage />} />
          <Route path="/payment-failure" element={<PaymentFailurePage />} />
          <Route path="/checkout"        element={<CheckoutPage />} />
          <Route path="/homes"                  element={<FsboSearchPage />} />
          <Route path="/my-listing/:propertyId" element={<ProtectedRoute><FsboListingManagerPage /></ProtectedRoute>} />
          <Route path="/for-sale/:propertyId"    element={<FsboListingPage />} />
          <Route path="/transfer/claim/:token" element={<PropertyTransferClaimPage />} />
          <Route path="/manage/claim/:token"   element={<PropertyManagerClaimPage />} />

          <Route path="/register"     element={<ProtectedRoute><RegisterPage /></ProtectedRoute>} />
          <Route path="/dashboard"    element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/contractor-dashboard" element={<ProtectedRoute><ContractorDashboardPage /></ProtectedRoute>} />
          <Route path="/contractors"  element={<ProtectedRoute><ContractorBrowsePage /></ProtectedRoute>} />
          <Route path="/contractor/:id" element={<ProtectedRoute><ContractorPublicPage /></ProtectedRoute>} />
          <Route path="/contractor/profile" element={<ProtectedRoute><ContractorProfilePage /></ProtectedRoute>} />
          <Route path="/properties/new" element={<ProtectedRoute><PropertyRegisterPage /></ProtectedRoute>} />
          <Route path="/properties/:id" element={<ProtectedRoute><PropertyDetailPage /></ProtectedRoute>} />
          <Route path="/properties/:id/verify" element={<ProtectedRoute><PropertyVerifyPage /></ProtectedRoute>} />
          <Route path="/properties/:id/systems" element={<ProtectedRoute><SystemAgesPage /></ProtectedRoute>} />
          <Route path="/jobs/new"     element={<ProtectedRoute><JobCreatePage /></ProtectedRoute>} />
          <Route path="/quotes/new"   element={<ProtectedRoute><QuoteRequestPage /></ProtectedRoute>} />
          <Route path="/quotes/:id"   element={<ProtectedRoute><QuoteDetailPage /></ProtectedRoute>} />
          <Route path="/settings"     element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/market"       element={<ProtectedRoute><MarketIntelligencePage /></ProtectedRoute>} />
          <Route path="/maintenance"  element={<ProtectedRoute><PredictiveMaintenancePage /></ProtectedRoute>} />
          <Route path="/admin"        element={<ProtectedRoute><AdminDashboardPage /></ProtectedRoute>} />
          <Route path="/onboarding"   element={<ProtectedRoute><OnboardingWizard /></ProtectedRoute>} />
          <Route path="/agent-dashboard" element={<ProtectedRoute><AgentDashboardPage /></ProtectedRoute>} />
          <Route path="/sensors"      element={<ProtectedRoute><SensorPage /></ProtectedRoute>} />
          <Route path="/warranties"   element={<ProtectedRoute><WarrantyWalletPage /></ProtectedRoute>} />
          <Route path="/insurance-defense" element={<ProtectedRoute><InsuranceDefensePage /></ProtectedRoute>} />
          <Route path="/resale-ready" element={<ProtectedRoute><ResaleReadyPage /></ProtectedRoute>} />
          <Route path="/recurring/new" element={<ProtectedRoute><RecurringServiceCreatePage /></ProtectedRoute>} />
          <Route path="/recurring/:id" element={<ProtectedRoute><RecurringServiceDetailPage /></ProtectedRoute>} />
          <Route path="/listing/new"  element={<ProtectedRoute><ListingNewPage /></ProtectedRoute>} />
          <Route path="/listing/:id"  element={<ProtectedRoute><ListingDetailPage /></ProtectedRoute>} />
          <Route path="/agent/marketplace" element={<ProtectedRoute><AgentMarketplacePage /></ProtectedRoute>} />
          <Route path="/agent/profile" element={<ProtectedRoute><AgentProfileEditPage /></ProtectedRoute>} />
          <Route path="/agent/:id"    element={<ProtectedRoute><AgentPublicPage /></ProtectedRoute>} />
          <Route path="/agents"       element={<ProtectedRoute><AgentBrowsePage /></ProtectedRoute>} />

          {/* Demo — public, no auth required */}
          <Route path="/demo"          element={<DemoPage />} />
          <Route path="/demo/:persona" element={<DemoPage />} />

          {/* Buyer's Truth Kit — public free tool */}
          <Route path="/truth-kit" element={<BuyersTruthKitPage />} />

          {/* Public — no auth required */}
          <Route path="/home-systems"          element={<HomeSystemsEstimatorPage />} />
          <Route path="/check"                 element={<CheckAddressPage />} />
          <Route path="/prices"                element={<PriceLookupPage />} />
          <Route path="/instant-forecast"     element={<InstantForecastPage />} />
          <Route path="/verify/:token"          element={<ContractorVerifyPage />} />
          <Route path="/report/:token"         element={<ReportPage />} />
          <Route path="/badge/:token"          element={<BadgePage />} />
          <Route path="/cert/:token"           element={<ScoreCertPage />} />
          {/* /neighborhood/:zipCode removed — NeighborhoodHealthPage kept in codebase for future re-enable */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </RouteErrorBoundary>
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  );
}
