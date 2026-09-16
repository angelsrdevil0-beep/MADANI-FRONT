import { describe, expect, test } from "vitest";
import { setSecurityHeaders } from "../../src/server/SecurityHeaders";

describe("SecurityHeaders", () => {
  test("sets baseline hardening headers", () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    } as any;

    setSecurityHeaders(response);

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=15552000; includeSubDomains",
    );
  });

  test("does not restrict the payment permission, so Stripe checkout keeps working", () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    } as any;

    setSecurityHeaders(response);

    const permissionsPolicy = headers.get("Permissions-Policy") ?? "";
    expect(permissionsPolicy).not.toContain("payment");
    expect(permissionsPolicy).toContain("camera=()");
    expect(permissionsPolicy).toContain("microphone=()");
    expect(permissionsPolicy).toContain("geolocation=()");
  });
});
