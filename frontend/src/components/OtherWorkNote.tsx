import { serviceSubtypeKey } from "@homegentic/shared/serviceTypes";
import { V2_COLORS, V2_FONTS } from "@/theme";

/** #721: true for Other and its subtypes (Septic, Inspection, …): work with no contractor trade. */
export function isOtherWork(serviceType: string): boolean {
  return serviceType === "Other" || serviceSubtypeKey(serviceType) !== undefined;
}

/**
 * Under a quote form's service picker: how a request for work with no
 * contractor trade reaches contractors. Contractors list trades, and no
 * trade covers these, so leads aren't matched by trade; the request sits
 * among open requests.
 */
export function OtherWorkNote({ serviceType }: { serviceType: string }) {
  if (!isOtherWork(serviceType)) return null;
  const text =
    serviceType === "Other"
      ? "Other work isn't a trade contractors list on HomeGentic. Contractors can find your request and bid on it among open requests."
      : `HomeGentic doesn't list contractors for ${serviceType} yet. Your request is posted as Other work, which contractors can find and bid on among open requests.`;
  return (
    <p
      data-testid="other-work-note"
      style={{
        margin: "0.375rem 0 0",
        fontFamily: V2_FONTS.body,
        fontSize: "0.8125rem",
        color: V2_COLORS.muted,
        lineHeight: 1.45,
      }}
    >
      {text}
    </p>
  );
}
