"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { operationsErpRegistry, type OperationsModuleId } from "@/modules/operations/erp-registry";
import { requireIdentityAdmin } from "@/server/identity/auth-context";
import { isIdentityPublicError } from "@/server/identity/errors";
import { identityService } from "@/server/identity/runtime";
import { getDemoOperationsSnapshot } from "@/modules/operations/demo-store";

const roleSchema = z.enum(["owner", "administrator", "accountant", "sales", "warehouse", "dispatcher", "driver", "worker", "supervisor", "viewer", "customer", "supplier"]);
const moduleSchema = z.enum(
  operationsErpRegistry.navigation.map((module) => module.id) as [OperationsModuleId, ...OperationsModuleId[]]
);

const invitationSchema = z.object({
  email: z.string().max(254, "Email lời mời không hợp lệ.").trim().email("Email lời mời không hợp lệ."),
  role: roleSchema,
  moduleIds: z.array(moduleSchema).min(1, "Chọn ít nhất module Tổng quan.")
});

const accessSchema = z.object({
  userId: z.string().uuid("Tài khoản cần cập nhật không hợp lệ."),
  role: roleSchema,
  status: z.enum(["invited", "active", "disabled"]),
  moduleIds: z.array(moduleSchema).min(1, "Chọn ít nhất module Tổng quan.")
});

const managedWorkerSchema = z.object({
  displayName: z.string().max(100, "Họ tên Thợ không được vượt quá 100 ký tự.").trim().min(2, "Họ tên Thợ phải có ít nhất 2 ký tự."),
  username: z.string().max(30, "Tên đăng nhập không được vượt quá 30 ký tự.").trim().min(3, "Tên đăng nhập phải có ít nhất 3 ký tự."),
  password: z.string().min(12, "Mật khẩu phải có ít nhất 12 ký tự.").max(128, "Mật khẩu không được vượt quá 128 ký tự."),
  confirmPassword: z.string().min(1, "Nhập lại mật khẩu.").max(128, "Mật khẩu không được vượt quá 128 ký tự.")
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "Mật khẩu nhập lại chưa khớp."
});

const managedCustomerSchema = z.object({
  customerId: z.string().trim().min(1, "Chọn khách hàng cần cấp tài khoản."),
  username: z.string().max(30, "Tên đăng nhập không được vượt quá 30 ký tự.").trim().min(3, "Tên đăng nhập phải có ít nhất 3 ký tự."),
  password: z.string().min(12, "Mật khẩu phải có ít nhất 12 ký tự.").max(128, "Mật khẩu không được vượt quá 128 ký tự."),
  confirmPassword: z.string().min(1, "Nhập lại mật khẩu.").max(128, "Mật khẩu không được vượt quá 128 ký tự.")
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "Mật khẩu nhập lại chưa khớp."
});

const managedSupplierSchema = z.object({
  supplierId: z.string().trim().min(1, "Chọn nhà cung cấp cần cấp tài khoản."),
  username: z.string().max(30, "Tên đăng nhập không được vượt quá 30 ký tự.").trim().min(3, "Tên đăng nhập phải có ít nhất 3 ký tự."),
  password: z.string().min(12, "Mật khẩu phải có ít nhất 12 ký tự.").max(128, "Mật khẩu không được vượt quá 128 ký tự."),
  confirmPassword: z.string().min(1, "Nhập lại mật khẩu.").max(128, "Mật khẩu không được vượt quá 128 ký tự.")
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "Mật khẩu nhập lại chưa khớp."
});

const passwordResetSchema = z.object({
  userId: z.string().uuid("Tài khoản cần đặt lại mật khẩu không hợp lệ."),
  password: z.string().min(12, "Mật khẩu mới phải có ít nhất 12 ký tự.").max(128, "Mật khẩu không được vượt quá 128 ký tự."),
  confirmPassword: z.string().min(1, "Nhập lại mật khẩu mới.").max(128, "Mật khẩu không được vượt quá 128 ký tự.")
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "Mật khẩu nhập lại chưa khớp."
});

const identityLinkSchema = z.object({
  userId: z.string().uuid("Tài khoản liên kết không hợp lệ."),
  employeeId: z.string().trim().min(1, "Chọn nhân viên hợp lệ."),
  expectedSessionVersion: z.coerce.number().int().min(0, "Phiên đăng nhập không hợp lệ."),
  reason: z.string().trim().min(8, "Lý do liên kết phải rõ ràng, tối thiểu 8 ký tự.").max(500, "Lý do liên kết không được quá 500 ký tự.")
});

export async function createManagedWorkerAction(formData: FormData) {
  let redirectTarget = "/admin";
  try {
    const actor = await requireIdentityAdmin();
    const input = managedWorkerSchema.parse({
      displayName: formData.get("displayName"),
      username: formData.get("username"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword")
    });
    const user = await identityService.createManagedWorker(actor, input);
    revalidatePath("/admin");
    redirectTarget = `/admin?message=${encodeURIComponent(`Đã tạo tài khoản Thợ ${user.username}.`)}`;
  } catch (error) {
    redirectTarget = `/admin?error=${encodeURIComponent(expectedAdminError(error, "Không thể tạo tài khoản Thợ."))}`;
  }
  redirect(redirectTarget);
}

export async function linkIdentityToEmployeeAction(formData: FormData) {
  let redirectTarget = "/admin";
  try {
    const actor = await requireIdentityAdmin();
    const input = identityLinkSchema.parse({
      userId: formData.get("userId"),
      employeeId: formData.get("employeeId"),
      expectedSessionVersion: formData.get("expectedSessionVersion"),
      reason: formData.get("reason")
    });
    const snapshot = await getDemoOperationsSnapshot();
    const employee = snapshot.state.employees.find((candidate) => candidate.id === input.employeeId && candidate.status === "active");
    if (!employee) {
      throw new Error("Nhân sự không tồn tại hoặc đã ngừng hoạt động.");
    }
    await identityService.linkEmployeeIdentity(actor, {
      ...input,
      employee,
      idempotencyKey: `employee-identity-link:${actor.id}:${input.userId}:${employee.id}:${input.expectedSessionVersion}`
    });
    revalidatePath("/admin");
    redirectTarget = `/admin?message=${encodeURIComponent(`Đã liên kết tài khoản với nhân viên ${employee.displayName}.`)}`;
  } catch (error) {
    redirectTarget = `/admin?error=${encodeURIComponent(expectedAdminError(error, "Không thể liên kết tài khoản này."))}`;
  }
  redirect(redirectTarget);
}

export async function createManagedCustomerAction(formData: FormData) {
  let redirectTarget = "/admin";
  try {
    const actor = await requireIdentityAdmin();
    const input = managedCustomerSchema.parse({
      customerId: formData.get("customerId"),
      username: formData.get("username"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword")
    });
    const snapshot = await getDemoOperationsSnapshot();
    const customer = snapshot.state.customers.find((candidate) => candidate.id === input.customerId && candidate.status === "active");
    if (!customer) {
      throw new Error("Khách hàng không tồn tại hoặc đã ngừng hoạt động.");
    }
    const user = await identityService.createManagedCustomer(actor, {
      customerId: customer.id,
      displayName: customer.displayName,
      username: input.username,
      password: input.password
    });
    revalidatePath("/admin");
    redirectTarget = `/admin?message=${encodeURIComponent(`Đã cấp tài khoản cổng khách hàng cho ${user.displayName}.`)}`;
  } catch (error) {
    redirectTarget = `/admin?error=${encodeURIComponent(expectedAdminError(error, "Không thể cấp tài khoản khách hàng."))}`;
  }
  redirect(redirectTarget);
}

export async function createManagedSupplierAction(formData: FormData) {
  let redirectTarget = "/admin";
  try {
    const actor = await requireIdentityAdmin();
    const input = managedSupplierSchema.parse({
      supplierId: formData.get("supplierId"),
      username: formData.get("username"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword")
    });
    const snapshot = await getDemoOperationsSnapshot();
    const supplier = snapshot.state.suppliers.find((candidate) => candidate.id === input.supplierId && candidate.status === "active");
    if (!supplier) {
      throw new Error("Nhà cung cấp không tồn tại hoặc đã ngừng hoạt động.");
    }
    const user = await identityService.createManagedSupplier(actor, {
      supplierId: supplier.id,
      displayName: supplier.displayName,
      username: input.username,
      password: input.password
    });
    revalidatePath("/admin");
    redirectTarget = `/admin?message=${encodeURIComponent(`Đã cấp tài khoản đối tác cho ${user.displayName}.`)}`;
  } catch (error) {
    redirectTarget = `/admin?error=${encodeURIComponent(expectedAdminError(error, "Không thể cấp tài khoản nhà cung cấp."))}`;
  }
  redirect(redirectTarget);
}

export async function inviteUserAction(formData: FormData) {
  let redirectTarget = "/admin";
  try {
    const actor = await requireIdentityAdmin();
    const input = invitationSchema.parse({
      email: formData.get("email"),
      role: formData.get("role"),
      moduleIds: formData.getAll("moduleIds")
    });
    const invitation = await identityService.inviteUser(actor, input);
    const origin = await getApplicationOrigin();
    const inviteUrl = new URL(`/invite/${invitation.token}`, origin).toString();
    const query = new URLSearchParams({
      message: `Đã tạo lời mời cho ${invitation.user.email}.`,
      invite: inviteUrl
    });
    redirectTarget = `/admin?${query.toString()}`;
    revalidatePath("/admin");
  } catch (error) {
    redirectTarget = `/admin?error=${encodeURIComponent(expectedAdminError(error, "Không thể tạo lời mời."))}`;
  }
  redirect(redirectTarget);
}

export async function updateUserAccessAction(formData: FormData) {
  let redirectTarget = "/admin";
  try {
    const actor = await requireIdentityAdmin();
    const input = accessSchema.parse({
      userId: formData.get("userId"),
      role: formData.get("role"),
      status: formData.get("status"),
      moduleIds: formData.getAll("moduleIds")
    });
    const user = await identityService.updateUserAccess(actor, input);
    revalidatePath("/admin");
    redirectTarget = `/admin?message=${encodeURIComponent(`Đã cập nhật quyền của ${user.username || user.email}.`)}`;
  } catch (error) {
    redirectTarget = `/admin?error=${encodeURIComponent(expectedAdminError(error, "Không thể cập nhật quyền."))}`;
  }
  redirect(redirectTarget);
}

export async function resetUserPasswordAction(formData: FormData) {
  let redirectTarget = "/admin";
  try {
    const actor = await requireIdentityAdmin();
    const input = passwordResetSchema.parse({
      userId: formData.get("userId"),
      password: formData.get("newPassword"),
      confirmPassword: formData.get("confirmNewPassword")
    });
    const user = await identityService.resetUserPassword(actor, input.userId, input.password);
    revalidatePath("/admin");
    redirectTarget = `/admin?message=${encodeURIComponent(`Đã đặt lại mật khẩu cho ${user.username || user.email}.`)}`;
  } catch (error) {
    redirectTarget = `/admin?error=${encodeURIComponent(expectedAdminError(error, "Không thể đặt lại mật khẩu."))}`;
  }
  redirect(redirectTarget);
}

async function getApplicationOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    const origin = new URL(configured);
    if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") {
      throw new Error("NEXT_PUBLIC_APP_URL phải dùng HTTPS trong môi trường production.");
    }
    return origin.origin;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Chưa cấu hình NEXT_PUBLIC_APP_URL cho môi trường production.");
  }
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const trustedDevelopmentHost = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host)
    ? host
    : "localhost:3000";
  return `http://${trustedDevelopmentHost}`;
}

function expectedAdminError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? fallback;
  }
  return isIdentityPublicError(error) ? error.message : fallback;
}
