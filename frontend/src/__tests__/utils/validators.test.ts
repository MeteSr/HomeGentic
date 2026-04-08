import {
  isValidEmail,
  isValidPhone,
  isValidZip,
  isValidUsState,
  isValidHttpsUrl,
  isValidEmailOrPhone,
} from "../../utils/validators";

// ── isValidEmail ─────────────────────────────────────────────────────────────

describe("isValidEmail", () => {
  it("accepts a standard address", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });
  it("accepts subdomains", () => {
    expect(isValidEmail("user@mail.example.co.uk")).toBe(true);
  });
  it("accepts plus-addressing", () => {
    expect(isValidEmail("user+tag@example.com")).toBe(true);
  });
  it("rejects missing @", () => {
    expect(isValidEmail("notanemail")).toBe(false);
  });
  it("rejects missing domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });
  it("rejects missing TLD", () => {
    expect(isValidEmail("user@example")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });
  it("rejects whitespace-only", () => {
    expect(isValidEmail("   ")).toBe(false);
  });
  it("rejects spaces inside address", () => {
    expect(isValidEmail("user @example.com")).toBe(false);
  });
  it("trims leading/trailing whitespace before validating", () => {
    expect(isValidEmail("  user@example.com  ")).toBe(true);
  });
});

// ── isValidPhone ─────────────────────────────────────────────────────────────

describe("isValidPhone", () => {
  it("accepts US format with dashes", () => {
    expect(isValidPhone("512-555-0100")).toBe(true);
  });
  it("accepts US format with dots", () => {
    expect(isValidPhone("512.555.0100")).toBe(true);
  });
  it("accepts parentheses format", () => {
    expect(isValidPhone("(512) 555-0100")).toBe(true);
  });
  it("accepts international format", () => {
    expect(isValidPhone("+1 512 555 0100")).toBe(true);
  });
  it("accepts digits only", () => {
    expect(isValidPhone("5125550100")).toBe(true);
  });
  it("rejects empty string", () => {
    expect(isValidPhone("")).toBe(false);
  });
  it("rejects letters", () => {
    expect(isValidPhone("call-me-maybe")).toBe(false);
  });
  it("rejects too short (< 7 digits)", () => {
    expect(isValidPhone("123")).toBe(false);
  });
  it("rejects too long (> 20 chars)", () => {
    expect(isValidPhone("1234567890123456789012345")).toBe(false);
  });
  it("trims before validating", () => {
    expect(isValidPhone("  (512) 555-0100  ")).toBe(true);
  });
});

// ── isValidZip ───────────────────────────────────────────────────────────────

describe("isValidZip", () => {
  it("accepts 5-digit ZIP", () => {
    expect(isValidZip("78701")).toBe(true);
  });
  it("accepts ZIP+4 format", () => {
    expect(isValidZip("78701-1234")).toBe(true);
  });
  it("rejects 4-digit ZIP", () => {
    expect(isValidZip("7870")).toBe(false);
  });
  it("rejects 6-digit ZIP", () => {
    expect(isValidZip("787011")).toBe(false);
  });
  it("rejects letters", () => {
    expect(isValidZip("7870A")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isValidZip("")).toBe(false);
  });
  it("rejects ZIP+3 (wrong suffix length)", () => {
    expect(isValidZip("78701-123")).toBe(false);
  });
  it("trims before validating", () => {
    expect(isValidZip("  78701  ")).toBe(true);
  });
});

// ── isValidUsState ───────────────────────────────────────────────────────────

describe("isValidUsState", () => {
  it("accepts uppercase TX", () => {
    expect(isValidUsState("TX")).toBe(true);
  });
  it("accepts lowercase tx", () => {
    expect(isValidUsState("tx")).toBe(true);
  });
  it("accepts all 50 states + DC", () => {
    const states = [
      "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
      "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
      "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
      "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
      "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
    ];
    states.forEach((s) => expect(isValidUsState(s)).toBe(true));
  });
  it("rejects XX", () => {
    expect(isValidUsState("XX")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isValidUsState("")).toBe(false);
  });
  it("rejects full state name", () => {
    expect(isValidUsState("Texas")).toBe(false);
  });
  it("trims before validating", () => {
    expect(isValidUsState("  TX  ")).toBe(true);
  });
});

// ── isValidHttpsUrl ──────────────────────────────────────────────────────────

describe("isValidHttpsUrl", () => {
  it("accepts a valid https URL", () => {
    expect(isValidHttpsUrl("https://example.com/logo.png")).toBe(true);
  });
  it("accepts https with subdomain", () => {
    expect(isValidHttpsUrl("https://cdn.example.com/img.jpg")).toBe(true);
  });
  it("rejects http (not https)", () => {
    expect(isValidHttpsUrl("http://example.com/logo.png")).toBe(false);
  });
  it("rejects bare domain with no scheme", () => {
    expect(isValidHttpsUrl("example.com/logo.png")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isValidHttpsUrl("")).toBe(false);
  });
  it("rejects random string", () => {
    expect(isValidHttpsUrl("not a url")).toBe(false);
  });
  it("trims before validating", () => {
    expect(isValidHttpsUrl("  https://example.com/logo.png  ")).toBe(true);
  });
});

// ── isValidEmailOrPhone ──────────────────────────────────────────────────────

describe("isValidEmailOrPhone", () => {
  it("accepts a valid email", () => {
    expect(isValidEmailOrPhone("user@example.com")).toBe(true);
  });
  it("accepts a valid phone", () => {
    expect(isValidEmailOrPhone("(512) 555-0100")).toBe(true);
  });
  it("rejects a string that is neither", () => {
    expect(isValidEmailOrPhone("not-valid")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isValidEmailOrPhone("")).toBe(false);
  });
});
