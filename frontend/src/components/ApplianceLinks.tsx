import { applianceLinks } from "@homegentic/shared/applianceLinks";

const BODY = "'Hanken Grotesk',sans-serif";

const linkStyle: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: 12,
  fontWeight: 500,
  color: "var(--hg-blue-ink)",
  textDecoration: "none",
};

/** "Manual" and "Parts" searches for a saved appliance; opens in a new tab, nothing is saved or sent. */
export function ApplianceLinks({ brand, model }: { brand: string; model: string }) {
  const links = applianceLinks(brand, model);
  if (!links) return null;
  return (
    <div style={{ display: "flex", gap: 12, marginTop: 2 }}>
      <a
        href={links.manualUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
        title={
          links.manufacturerSite
            ? `Search ${links.manufacturerSite} for this model's manual`
            : "Search the web for this model's manual"
        }
      >
        Manual ↗
      </a>
      <a
        href={links.partsUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
        title="Search for this model's replacement parts"
      >
        Parts ↗
      </a>
    </div>
  );
}
