import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  redirect: vi.fn((location: string) => { throw { name: "test-redirect", location }; }),
  revalidatePath: vi.fn(),
  requireIdentityAdmin: vi.fn(),
  getSnapshot: vi.fn(),
  createManagedWorker: vi.fn(),
  createManagedCustomer: vi.fn(),
  createManagedSupplier: vi.fn(),
  inviteUser: vi.fn(),
  updateUserAccess: vi.fn(),
  resetUserPassword: vi.fn()
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/identity/auth-context", () => ({ requireIdentityAdmin: mocks.requireIdentityAdmin }));
vi.mock("@/modules/operations/demo-store", () => ({ getDemoOperationsSnapshot: mocks.getSnapshot }));
vi.mock("@/server/identity/runtime", () => ({
  identityService: {
    createManagedWorker: mocks.createManagedWorker,
    createManagedCustomer: mocks.createManagedCustomer,
    createManagedSupplier: mocks.createManagedSupplier,
    inviteUser: mocks.inviteUser,
    updateUserAccess: mocks.updateUserAccess,
    resetUserPassword: mocks.resetUserPassword
  }
}));

import {
  createManagedCustomerAction,
  createManagedSupplierAction,
  createManagedWorkerAction,
  inviteUserAction,
  resetUserPasswordAction,
  updateUserAccessAction
} from "@/app/admin/actions";

const admin = { id: "owner-1", role: "owner" };
const userId = "11111111-1111-4111-8111-111111111111";

function managedForm(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

async function expectAdminRedirect(action: Promise<unknown>, locationPrefix: string) {
  await expect(action).rejects.toMatchObject({ name: "test-redirect", location: expect.stringContaining(locationPrefix) });
}

describe("identity administration server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireIdentityAdmin.mockResolvedValue(admin);
    mocks.headers.mockResolvedValue(new Headers({ host: "localhost:3000" }));
    mocks.getSnapshot.mockResolvedValue({
      state: {
        customers: [{ id: "customer-1", displayName: "Cong trinh Minh Anh", status: "active" }],
        suppliers: [{ id: "supplier-1", displayName: "Xi mang Hoang Thach", status: "active" }]
      }
    });
  });

  it("creates a worker account only through an authenticated administrator", async () => {
    mocks.createManagedWorker.mockResolvedValue({ username: "tho_nam" });
    const formData = managedForm({
      displayName: "Nguyen Van Nam",
      username: "tho_nam",
      password: "long-enough-password",
      confirmPassword: "long-enough-password"
    });

    await expectAdminRedirect(createManagedWorkerAction(formData), "/admin?message=");

    expect(mocks.createManagedWorker).toHaveBeenCalledWith(admin, {
      displayName: "Nguyen Van Nam",
      username: "tho_nam",
      password: "long-enough-password",
      confirmPassword: "long-enough-password"
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("does not call the identity service when a managed worker password confirmation is invalid", async () => {
    const formData = managedForm({
      displayName: "Nguyen Van Nam",
      username: "tho_nam",
      password: "long-enough-password",
      confirmPassword: "different-password"
    });

    await expectAdminRedirect(createManagedWorkerAction(formData), "/admin?error=");

    expect(mocks.createManagedWorker).not.toHaveBeenCalled();
  });

  it("binds a new customer portal account to an active customer record, not a browser display name", async () => {
    mocks.createManagedCustomer.mockResolvedValue({ displayName: "Cong trinh Minh Anh" });
    const formData = managedForm({
      customerId: "customer-1",
      username: "minh_anh",
      password: "long-enough-password",
      confirmPassword: "long-enough-password"
    });

    await expectAdminRedirect(createManagedCustomerAction(formData), "/admin?message=");

    expect(mocks.createManagedCustomer).toHaveBeenCalledWith(admin, {
      customerId: "customer-1",
      displayName: "Cong trinh Minh Anh",
      username: "minh_anh",
      password: "long-enough-password"
    });
  });

  it("rejects an inactive or missing customer before issuing an account", async () => {
    mocks.getSnapshot.mockResolvedValue({ state: { customers: [{ id: "customer-1", displayName: "Old", status: "inactive" }], suppliers: [] } });
    const formData = managedForm({
      customerId: "customer-1",
      username: "minh_anh",
      password: "long-enough-password",
      confirmPassword: "long-enough-password"
    });

    await expectAdminRedirect(createManagedCustomerAction(formData), "/admin?error=");

    expect(mocks.createManagedCustomer).not.toHaveBeenCalled();
  });

  it("binds a supplier portal account to an active supplier record", async () => {
    mocks.createManagedSupplier.mockResolvedValue({ displayName: "Xi mang Hoang Thach" });
    const formData = managedForm({
      supplierId: "supplier-1",
      username: "hoang_thach",
      password: "long-enough-password",
      confirmPassword: "long-enough-password"
    });

    await expectAdminRedirect(createManagedSupplierAction(formData), "/admin?message=");

    expect(mocks.createManagedSupplier).toHaveBeenCalledWith(admin, {
      supplierId: "supplier-1",
      displayName: "Xi mang Hoang Thach",
      username: "hoang_thach",
      password: "long-enough-password"
    });
  });

  it("creates an invitation URL from the configured HTTPS application origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://erp.example.test");
    mocks.inviteUser.mockResolvedValue({ token: "invite-token", user: { email: "worker@example.test" } });
    const formData = managedForm({ email: "worker@example.test", role: "worker" });
    formData.append("moduleIds", "overview");

    await expectAdminRedirect(inviteUserAction(formData), "/admin?message=");

    expect(mocks.inviteUser).toHaveBeenCalledWith(admin, {
      email: "worker@example.test",
      role: "worker",
      moduleIds: ["overview"]
    });
    const location = mocks.redirect.mock.calls[0]?.[0] as string;
    expect(decodeURIComponent(location)).toContain("https://erp.example.test/invite/invite-token");
    vi.unstubAllEnvs();
  });

  it("updates access only with a valid user identity, role and allowed module", async () => {
    mocks.updateUserAccess.mockResolvedValue({ username: "tho_nam" });
    const formData = managedForm({ userId, role: "worker", status: "active" });
    formData.append("moduleIds", "overview");

    await expectAdminRedirect(updateUserAccessAction(formData), "/admin?message=");

    expect(mocks.updateUserAccess).toHaveBeenCalledWith(admin, {
      userId,
      role: "worker",
      status: "active",
      moduleIds: ["overview"]
    });
  });

  it("resets a password only after the UUID and confirmation are validated", async () => {
    mocks.resetUserPassword.mockResolvedValue({ username: "tho_nam" });
    const formData = managedForm({
      userId,
      newPassword: "long-enough-password",
      confirmNewPassword: "long-enough-password"
    });

    await expectAdminRedirect(resetUserPasswordAction(formData), "/admin?message=");

    expect(mocks.resetUserPassword).toHaveBeenCalledWith(admin, userId, "long-enough-password");
  });
});
