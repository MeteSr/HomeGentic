import { useState } from "react";

const PULSE_KEY = () => `homegentic_pulse_${new Date().toISOString().slice(0, 7)}`;

export interface DashboardDismissals {
  bannerDismissed: boolean;
  dismissBanner(): void;

  dismissedBaselinePrompts: Set<string>;
  dismissBaselinePrompt(propertyId: string): void;

  milestoneDismissed: boolean;
  dismissMilestone(): void;

  milestone3Dismissed: boolean;
  dismissMilestone3(): void;

  upgradeBannerDismissed: boolean;
  dismissUpgradeBanner(): void;

  pulseDismissed: boolean;
  dismissPulse(): void;

  scoreIncreaseDismissed: boolean;
  dismissScoreIncrease(): void;

  dismissedReEngagements: Set<string>;
  dismissReEngagement(jobId: string): void;
}

export function useDashboardDismissals(): DashboardDismissals {
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [dismissedBaselinePrompts, setDismissedBaselinePrompts] = useState<Set<string>>(
    () => new Set(
      Object.keys(localStorage)
        .filter((k) => k.startsWith("homegentic_baseline_prompt_dismissed_"))
        .map((k) => k.replace("homegentic_baseline_prompt_dismissed_", ""))
    )
  );

  const [milestoneDismissed, setMilestoneDismissed] = useState(
    () => !!localStorage.getItem("homegentic_milestone_dismissed")
  );

  const [milestone3Dismissed, setMilestone3Dismissed] = useState(
    () => !!localStorage.getItem("homegentic_3job_milestone")
  );

  const [upgradeBannerDismissed, setUpgradeBannerDismissed] = useState(
    () => !!localStorage.getItem("homegentic_upgrade_banner_dismissed")
  );

  const [pulseDismissed, setPulseDismissed] = useState(
    () => !!localStorage.getItem(PULSE_KEY())
  );

  const [scoreIncreaseDismissed, setScoreIncreaseDismissed] = useState(false);

  const [dismissedReEngagements, setDismissedReEngagements] = useState<Set<string>>(
    () => new Set(
      Object.keys(localStorage)
        .filter((k) => k.startsWith("homegentic_reengage_"))
        .map((k) => k.replace("homegentic_reengage_", ""))
    )
  );

  return {
    bannerDismissed,
    dismissBanner: () => setBannerDismissed(true),

    dismissedBaselinePrompts,
    dismissBaselinePrompt: (propertyId: string) => {
      localStorage.setItem(`homegentic_baseline_prompt_dismissed_${propertyId}`, "1");
      setDismissedBaselinePrompts((prev) => new Set([...prev, propertyId]));
    },

    milestoneDismissed,
    dismissMilestone: () => {
      localStorage.setItem("homegentic_milestone_dismissed", "1");
      setMilestoneDismissed(true);
    },

    milestone3Dismissed,
    dismissMilestone3: () => {
      localStorage.setItem("homegentic_3job_milestone", "1");
      setMilestone3Dismissed(true);
    },

    upgradeBannerDismissed,
    dismissUpgradeBanner: () => {
      localStorage.setItem("homegentic_upgrade_banner_dismissed", "1");
      setUpgradeBannerDismissed(true);
    },

    pulseDismissed,
    dismissPulse: () => {
      localStorage.setItem(PULSE_KEY(), "1");
      setPulseDismissed(true);
    },

    scoreIncreaseDismissed,
    dismissScoreIncrease: () => setScoreIncreaseDismissed(true),

    dismissedReEngagements,
    dismissReEngagement: (jobId: string) => {
      localStorage.setItem(`homegentic_reengage_${jobId}`, "1");
      setDismissedReEngagements((prev) => new Set([...prev, jobId]));
    },
  };
}
