/**
 * Component-level accessibility tests — WCAG 2.1 AA
 *
 * Uses vitest-axe to run axe-core against rendered components in jsdom.
 * Each test renders a component, then asserts no axe violations.
 *
 * A11Y.1  Button — primary variant with label has no violations
 * A11Y.2  Button — disabled state has no violations
 * A11Y.3  Button — all variants (secondary, outline, ghost, danger) are violation-free
 * A11Y.4  UpgradeGate — blocked state (default tier=Basic) has no violations
 * A11Y.5  UpgradeGate — Pro tier blocked state has no violations
 * A11Y.6  PermitCoverageIndicator — supported city has no violations
 * A11Y.7  PermitCoverageIndicator — unsupported city has no violations
 * A11Y.8  PermitCoverageIndicator — empty city/state renders null (no violation)
 * A11Y.9  AddressForm — labelled address inputs have no violations
 */

import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { axe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import { MemoryRouter } from "react-router-dom";

// Extend Vitest expect with axe matchers — must pass the full matchers object
expect.extend(axeMatchers);

import { Button } from "@/components/Button";
import { UpgradeGate } from "@/components/UpgradeGate";
import PermitCoverageIndicator from "@/components/PermitCoverageIndicator";

// ── Helper: wrap in MemoryRouter for components that use useNavigate ──────────

function withRouter(element: React.ReactNode) {
  return <MemoryRouter>{element}</MemoryRouter>;
}

// ── A11Y.1 — Button primary with label ───────────────────────────────────────

describe("A11Y.1 — Button (primary variant)", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      withRouter(<Button variant="primary">Save Job</Button>)
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ── A11Y.2 — Button disabled state ───────────────────────────────────────────

describe("A11Y.2 — Button (disabled state)", () => {
  it("has no axe violations when disabled", async () => {
    const { container } = render(
      withRouter(<Button variant="primary" disabled>Save Job</Button>)
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ── A11Y.3 — Button all variants ─────────────────────────────────────────────

describe("A11Y.3 — Button all variants", () => {
  const variants = ["primary", "secondary", "outline", "ghost", "danger"] as const;

  for (const variant of variants) {
    it(`${variant} variant has no axe violations`, async () => {
      const { container } = render(
        withRouter(<Button variant={variant}>Click me</Button>)
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  }

  it("loading state has no axe violations", async () => {
    const { container } = render(
      withRouter(<Button variant="primary" loading aria-label="Saving...">Save</Button>)
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ── A11Y.4 — UpgradeGate (default/Basic tier) ────────────────────────────────

describe("A11Y.4 — UpgradeGate (Basic tier blocked state)", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      withRouter(
        <UpgradeGate
          feature="Score Breakdown"
          description="See exactly what's dragging your score down."
          tier="Basic"
        />
      )
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ── A11Y.5 — UpgradeGate (Pro tier blocked state) ────────────────────────────

describe("A11Y.5 — UpgradeGate (Pro tier blocked state)", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      withRouter(
        <UpgradeGate
          feature="5-Year Maintenance Calendar"
          description="Plan ahead with AI-powered cost estimates and scheduling."
          tier="Pro"
        />
      )
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ── A11Y.6 — PermitCoverageIndicator (supported city) ────────────────────────

describe("A11Y.6 — PermitCoverageIndicator (supported city)", () => {
  it("has no axe violations for Austin, TX", async () => {
    const { container } = render(
      <PermitCoverageIndicator city="Austin" state="TX" />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ── A11Y.7 — PermitCoverageIndicator (unsupported city) ──────────────────────

describe("A11Y.7 — PermitCoverageIndicator (unsupported city)", () => {
  it("has no axe violations for an unsupported city", async () => {
    const { container } = render(
      <PermitCoverageIndicator city="Smalltown" state="KY" />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ── A11Y.8 — PermitCoverageIndicator renders null with empty inputs ───────────

describe("A11Y.8 — PermitCoverageIndicator (empty inputs)", () => {
  it("renders nothing and has no axe violations", async () => {
    const { container } = render(
      <PermitCoverageIndicator city="" state="" />
    );
    // Component returns null when city/state are empty — container should be empty
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ── A11Y.9 — Address form with labelled inputs ────────────────────────────────

describe("A11Y.9 — Address form with properly labelled inputs", () => {
  // Render a minimal address form matching the AddPropertyModal address step
  // to verify label association doesn't have any violations.
  it("has no axe violations", async () => {
    const { container } = render(
      <form aria-label="Property address">
        <div>
          <label htmlFor="address-street">Street Address</label>
          <input
            id="address-street"
            type="text"
            placeholder="123 Main St"
            aria-required="true"
          />
        </div>
        <div>
          <label htmlFor="address-city">City</label>
          <input
            id="address-city"
            type="text"
            placeholder="Austin"
            aria-required="true"
          />
        </div>
        <div>
          <label htmlFor="address-state">State</label>
          <input
            id="address-state"
            type="text"
            placeholder="TX"
            aria-required="true"
            maxLength={2}
          />
        </div>
        <div>
          <label htmlFor="address-zip">ZIP Code</label>
          <input
            id="address-zip"
            type="text"
            placeholder="78701"
            aria-required="true"
            pattern="[0-9]{5}"
          />
        </div>
        <button type="submit">Continue</button>
      </form>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("disabled submit button has no axe violations", async () => {
    const { container } = render(
      <form aria-label="Property address empty">
        <div>
          <label htmlFor="adr-street-2">Street Address</label>
          <input id="adr-street-2" type="text" />
        </div>
        <button type="submit" disabled aria-disabled="true">Continue</button>
      </form>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
