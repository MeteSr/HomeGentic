import { Layout } from "@/components/Layout";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { MobileHomeDashboard } from "@/pages/MobileHomeDashboard";
import { DashboardV3 } from "@/components/dashboardV3/DashboardV3";

export default function DashboardPage() {
  const { isMobile } = useBreakpoint();

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
