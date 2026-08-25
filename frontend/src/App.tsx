import React, { Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { errorTracker } from "@/services/errorTracker";

/** Records route changes as navigation breadcrumbs in the error tracker. */
function NavigationTracker() {
  const location = useLocation();
  useEffect(() => {
    errorTracker.trackNavigation(location.pathname);
  }, [location.pathname]);
  return null;
}

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
import ForProsPage           from "@/pages/ForProsPage";
import PaymentSuccessPage    from "@/pages/PaymentSuccessPage";
import PaymentFailurePage    from "@/pages/PaymentFailurePage";
import SampleReportPage      from "@/pages/SampleReportPage";

// All other pages lazy-loaded (split into separate chunks)
const RegisterPage               = React.lazy(() => import("@/pages/RegisterPage"));
const DashboardPage              = React.lazy(() => import("@/pages/DashboardPage"));
const PropertyDetailPage         = React.lazy(() => import("@/pages/PropertyDetailPage"));
const VerifyLayout              = React.lazy(() => import("@/pages/PropertyVerify/VerifyLayout"));
const VerifyClaimPage           = React.lazy(() => import("@/pages/PropertyVerify/VerifyClaimPage"));
const VerifyIdentityPage        = React.lazy(() => import("@/pages/PropertyVerify/VerifyIdentityPage"));
const VerifyDocumentPage        = React.lazy(() => import("@/pages/PropertyVerify/VerifyDocumentPage"));
const VerifyRepresentativePage  = React.lazy(() => import("@/pages/PropertyVerify/VerifyRepresentativePage"));
const VerifyStatusPage          = React.lazy(() => import("@/pages/PropertyVerify/VerifyStatusPage"));
const VerifyExpiredPage         = React.lazy(() => import("@/pages/PropertyVerify/VerifyExpiredPage"));
const VerifyContestedPage       = React.lazy(() => import("@/pages/PropertyVerify/VerifyContestedPage"));
const SystemAgesPage             = React.lazy(() => import("@/pages/SystemAgesPage"));
const JobCreatePage              = React.lazy(() => import("@/pages/JobCreatePage"));
const JobsPage                   = React.lazy(() => import("@/pages/JobsPage"));
const QuoteRequestPage           = React.lazy(() => import("@/pages/QuoteRequestPage"));
const QuoteDetailPage            = React.lazy(() => import("@/pages/QuoteDetailPage"));
const SettingsPage               = React.lazy(() => import("@/pages/SettingsPage"));
const ReferralPage               = React.lazy(() => import("@/pages/ReferralPage"));
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
const SensorPage                 = React.lazy(() => import("@/pages/SensorPage"));
const WarrantyWalletPage         = React.lazy(() => import("@/pages/WarrantyWalletPage"));
const InsuranceDefensePage       = React.lazy(() => import("@/pages/InsuranceDefensePage"));
const ResaleReadyPage            = React.lazy(() => import("@/pages/ResaleReadyPage"));
const RecurringServiceCreatePage = React.lazy(() => import("@/pages/RecurringServiceCreatePage"));
const RecurringServiceDetailPage = React.lazy(() => import("@/pages/RecurringServiceDetailPage"));
const PeoplePage                 = React.lazy(() => import("@/pages/PeoplePage"));
// NeighborhoodHealthPage intentionally not routed — page kept for future re-enable
// const NeighborhoodHealthPage  = React.lazy(() => import("@/pages/NeighborhoodHealthPage"));
const ListingNewPage             = React.lazy(() => import("@/pages/ListingNewPage"));
const ListingDetailPage          = React.lazy(() => import("@/pages/ListingDetailPage"));
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

// Blocks authenticated homeowners with no active paid subscription.
// ContractorFree passes through — only plain "Free" on a Homeowner role is rejected. tier===null means still loading; hold here
// to avoid a flash redirect before the subscription fetch resolves.
function PaidHomeownerRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, tier, profile } = useAuthStore();

  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (tier === null) return <PageLoader />;
  if (tier === "Free" && profile?.role === "Homeowner") {
    return <Navigate to="/pricing" replace />;
  }
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
        <NavigationTracker />
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
          <Route path="/for-pros"         element={<ForProsPage />} />
          <Route path="/payment-success" element={<PaymentSuccessPage />} />
          <Route path="/payment-failure" element={<PaymentFailurePage />} />
          <Route path="/checkout"        element={<CheckoutPage />} />
          <Route path="/homes"                  element={<FsboSearchPage />} />
          <Route path="/my-listing/:propertyId" element={<ProtectedRoute><FsboListingManagerPage /></ProtectedRoute>} />
          <Route path="/for-sale/:propertyId"    element={<FsboListingPage />} />
          <Route path="/transfer/claim/:token" element={<PropertyTransferClaimPage />} />
          <Route path="/manage/claim/:token"   element={<PropertyManagerClaimPage />} />

          <Route path="/register"     element={<ProtectedRoute><RegisterPage /></ProtectedRoute>} />
          <Route path="/dashboard"    element={<PaidHomeownerRoute><DashboardPage /></PaidHomeownerRoute>} />
          <Route path="/contractor-dashboard" element={<ProtectedRoute><ContractorDashboardPage /></ProtectedRoute>} />
          <Route path="/contractors"  element={<ProtectedRoute><ContractorBrowsePage /></ProtectedRoute>} />
          <Route path="/contractor/:id" element={<ProtectedRoute><ContractorPublicPage /></ProtectedRoute>} />
          <Route path="/contractor/profile" element={<ProtectedRoute><ContractorProfilePage /></ProtectedRoute>} />
          <Route path="/properties/new" element={<Navigate to="/dashboard" replace />} />
          <Route path="/properties/:id" element={<PaidHomeownerRoute><PropertyDetailPage /></PaidHomeownerRoute>} />
          <Route path="/properties/:id/verify" element={<PaidHomeownerRoute><VerifyLayout /></PaidHomeownerRoute>}>
            <Route index                  element={<VerifyClaimPage />} />
            <Route path="identity"        element={<VerifyIdentityPage />} />
            <Route path="document"        element={<VerifyDocumentPage />} />
            <Route path="representative"  element={<VerifyRepresentativePage />} />
            <Route path="status"          element={<VerifyStatusPage />} />
            <Route path="expired"         element={<VerifyExpiredPage />} />
            <Route path="contested"       element={<VerifyContestedPage />} />
          </Route>
          <Route path="/properties/:id/systems" element={<PaidHomeownerRoute><SystemAgesPage /></PaidHomeownerRoute>} />
          <Route path="/jobs"         element={<PaidHomeownerRoute><JobsPage /></PaidHomeownerRoute>} />
          <Route path="/jobs/new"     element={<PaidHomeownerRoute><JobCreatePage /></PaidHomeownerRoute>} />
          <Route path="/quotes/new"   element={<PaidHomeownerRoute><QuoteRequestPage /></PaidHomeownerRoute>} />
          <Route path="/quotes/:id"   element={<PaidHomeownerRoute><QuoteDetailPage /></PaidHomeownerRoute>} />
          <Route path="/settings"     element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/refer"        element={<ProtectedRoute><ReferralPage /></ProtectedRoute>} />
          <Route path="/market"       element={<PaidHomeownerRoute><MarketIntelligencePage /></PaidHomeownerRoute>} />
          <Route path="/maintenance"  element={<PaidHomeownerRoute><PredictiveMaintenancePage /></PaidHomeownerRoute>} />
          <Route path="/admin"        element={<ProtectedRoute><AdminDashboardPage /></ProtectedRoute>} />
          <Route path="/onboarding"   element={<Navigate to="/dashboard" replace />} />
          <Route path="/agent-dashboard" element={<Navigate to="/dashboard" replace />} />
          <Route path="/sensors"      element={<PaidHomeownerRoute><SensorPage /></PaidHomeownerRoute>} />
          <Route path="/warranties"   element={<PaidHomeownerRoute><WarrantyWalletPage /></PaidHomeownerRoute>} />
          <Route path="/insurance-defense" element={<PaidHomeownerRoute><InsuranceDefensePage /></PaidHomeownerRoute>} />
          <Route path="/resale-ready" element={<PaidHomeownerRoute><ResaleReadyPage /></PaidHomeownerRoute>} />
          <Route path="/recurring/new" element={<PaidHomeownerRoute><RecurringServiceCreatePage /></PaidHomeownerRoute>} />
          <Route path="/recurring/:id" element={<PaidHomeownerRoute><RecurringServiceDetailPage /></PaidHomeownerRoute>} />
          <Route path="/people"        element={<PaidHomeownerRoute><PeoplePage /></PaidHomeownerRoute>} />
          <Route path="/listing/new"  element={<PaidHomeownerRoute><ListingNewPage /></PaidHomeownerRoute>} />
          <Route path="/listing/:id"  element={<PaidHomeownerRoute><ListingDetailPage /></PaidHomeownerRoute>} />
          <Route path="/agent/marketplace" element={<Navigate to="/dashboard" replace />} />
          <Route path="/agent/profile" element={<Navigate to="/dashboard" replace />} />
          <Route path="/agent/:id"    element={<Navigate to="/dashboard" replace />} />
          <Route path="/agents"       element={<Navigate to="/dashboard" replace />} />

          {/* Demo — public, no auth required */}
          <Route path="/demo"          element={<DemoPage />} />
          <Route path="/demo/:persona" element={<DemoPage />} />

          {/* Buyer's Truth Kit — public free tool */}
          <Route path="/truth-kit" element={<BuyersTruthKitPage />} />

          {/* Sample report — public marketing page */}
          <Route path="/sample-report" element={<SampleReportPage />} />

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
