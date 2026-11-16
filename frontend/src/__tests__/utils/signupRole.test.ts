/** The role a sign-up button chose, kept until the new user registers. */
import { describe, it, expect, beforeEach } from "vitest";
import { rememberSignupRole, signupRole, clearSignupRole } from "@/utils/signupRole";

beforeEach(() => sessionStorage.clear());

describe("signupRole", () => {
  it("is null until a sign-up button sets it", () => {
    expect(signupRole()).toBeNull();
  });

  it("round-trips a known role and clears", () => {
    rememberSignupRole("Contractor");
    expect(signupRole()).toBe("Contractor");
    clearSignupRole();
    expect(signupRole()).toBeNull();
  });

  it("ignores anything that isn't a role you can sign up as", () => {
    sessionStorage.setItem("signupRole", "Admin");
    expect(signupRole()).toBeNull();
  });
});
