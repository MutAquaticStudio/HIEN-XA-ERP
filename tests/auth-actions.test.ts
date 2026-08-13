import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  redirect: vi.fn((location: string) => { throw { name: "test-redirect", location }; }),
  establishIdentitySession: vi.fn(),
  clearIdentitySession: vi.fn(),
  authenticate: vi.fn(),
  acceptInvitation: vi.fn(),
  recoverOwnerCredentials: vi.fn(),
  assertAllowed: vi.fn(),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
  getTrustedClientAddress: vi.fn()
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/identity/auth-context", () => ({
  establishIdentitySession: mocks.establishIdentitySession,
  clearIdentitySession: mocks.clearIdentitySession
}));
vi.mock("@/server/identity/runtime", () => ({
  identityService: {
    authenticate: mocks.authenticate,
    acceptInvitation: mocks.acceptInvitation,
    recoverOwnerCredentials: mocks.recoverOwnerCredentials
  }
}));
vi.mock("@/server/security/auth-rate-limit", () => ({
  authenticationRateLimiter: {
    assertAllowed: mocks.assertAllowed,
    recordFailure: mocks.recordFailure,
    recordSuccess: mocks.recordSuccess
  },
  getTrustedClientAddress: mocks.getTrustedClientAddress
}));

import {
  acceptInvitationAction,
  loginAction,
  logoutAction,
  recoverOwnerAction
} from "@/app/auth-actions";

function loginForm(identifier = "customer-1", password = "correct-password") {
  const formData = new FormData();
  formData.set("identifier", identifier);
  formData.set("password", password);
  return formData;
}

async function expectRedirect(action: Promise<unknown>, locationPrefix: string) {
  await expect(action).rejects.toMatchObject({ name: "test-redirect", location: expect.stringContaining(locationPrefix) });
}

describe("identity server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ host: "erp.example.test" }));
    mocks.getTrustedClientAddress.mockReturnValue("203.0.113.10");
  });

  it("establishes a session only after rate-limit and authentication checks pass", async () => {
    const user = { id: "customer-1", sessionVersion: 2, role: "customer" };
    mocks.authenticate.mockResolvedValue(user);

    await expectRedirect(loginAction(loginForm()), "/");

    expect(mocks.assertAllowed).toHaveBeenCalledWith("customer-1", "203.0.113.10");
    expect(mocks.authenticate).toHaveBeenCalledWith("customer-1", "correct-password");
    expect(mocks.recordSuccess).toHaveBeenCalledWith("customer-1", "203.0.113.10");
    expect(mocks.establishIdentitySession).toHaveBeenCalledWith(user);
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it("rejects a supplier login at the customer portal without granting a session", async () => {
    mocks.authenticate.mockResolvedValue({ id: "supplier-1", sessionVersion: 1, role: "supplier" });
    const formData = loginForm();
    formData.set("returnTo", "/khach-hang");

    await expectRedirect(loginAction(formData), "/khach-hang/dang-nhap?error=");

    expect(mocks.establishIdentitySession).not.toHaveBeenCalled();
    expect(mocks.recordSuccess).toHaveBeenCalledWith("customer-1", "203.0.113.10");
  });

  it("records an authentication failure and does not disclose an unexpected cause", async () => {
    mocks.authenticate.mockRejectedValue(new Error("database internals"));

    await expectRedirect(loginAction(loginForm()), "/login?error=");

    expect(mocks.recordFailure).toHaveBeenCalledWith("customer-1", "203.0.113.10");
    expect(mocks.establishIdentitySession).not.toHaveBeenCalled();
    const redirectLocation = mocks.redirect.mock.calls[0]?.[0] as string;
    expect(decodeURIComponent(redirectLocation)).not.toContain("database internals");
  });

  it("rejects malformed credentials before the rate limiter or identity service", async () => {
    await expectRedirect(loginAction(loginForm("x", "")), "/login?error=");

    expect(mocks.assertAllowed).not.toHaveBeenCalled();
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it("accepts a valid invitation, establishes its session, and redirects home", async () => {
    const user = { id: "worker-1", sessionVersion: 1, role: "worker" };
    mocks.acceptInvitation.mockResolvedValue(user);
    const formData = new FormData();
    formData.set("token", "x".repeat(24));
    formData.set("displayName", "Nguyen Van Nam");
    formData.set("password", "long-enough-password");
    formData.set("confirmPassword", "long-enough-password");

    await expectRedirect(acceptInvitationAction(formData), "/");

    expect(mocks.acceptInvitation).toHaveBeenCalledWith("x".repeat(24), "Nguyen Van Nam", "long-enough-password");
    expect(mocks.establishIdentitySession).toHaveBeenCalledWith(user);
  });

  it("does not attempt owner recovery when the configured recovery key is absent", async () => {
    vi.stubEnv("ERP_OWNER_RECOVERY_TOKEN", "");
    const formData = new FormData();
    formData.set("token", "r".repeat(24));
    formData.set("identifier", "new-owner");
    formData.set("password", "long-enough-password");
    formData.set("confirmPassword", "long-enough-password");

    await expectRedirect(recoverOwnerAction(formData), "/recover-owner?error=");

    expect(mocks.recoverOwnerCredentials).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("clears the current session before redirecting to login", async () => {
    await expectRedirect(logoutAction(), "/login");

    expect(mocks.clearIdentitySession).toHaveBeenCalledOnce();
  });
});
