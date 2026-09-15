import { useEffect, useRef } from "react";
import { Layout } from "@/components/Layout";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { MobileHomeDashboard } from "@/pages/MobileHomeDashboard";
import { DashboardV3 } from "@/components/dashboardV3/DashboardV3";
import { useAuthStore } from "@/store/authStore";
import { useAddPropertyStore } from "@/store/addPropertyStore";
import { usePropertySummary } from "@/hooks/usePropertySummary";

export default function DashboardPage() {
  const { isMobile } = useBreakpoint();
  const { profile } = useAuthStore();
  const { open: openAddProp } = useAddPropertyStore();
  const { properties, loading: propLoading } = usePropertySummary();

  // Runs regardless of the mobile/desktop branch below, so a new user with
  // no properties gets the onboarding wizard on either layout.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!propLoading && !autoOpenedRef.current && profile && !profile.onboardingComplete && properties.length === 0) {
      autoOpenedRef.current = true;
      openAddProp();
    }
  }, [propLoading, profile, properties.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isMobile) {
    return (
      <Layout>
        <MobileHomeDashboard />
      </Layout>
    );
  }

  return (
    <Layout>
      <DashboardV3 />
    </Layout>
  );
}
