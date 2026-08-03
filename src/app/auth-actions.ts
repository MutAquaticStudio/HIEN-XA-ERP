"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearIdentitySession, establishIdentitySession } from "@/server/identity/auth-context";
import { IdentityPublicError, isIdentityPublicError } from "@/server/identity/errors";
import { identityService } from "@/server/identity/runtime";
import {
  authenticationRateLimiter,
  getTrustedClientAddress
} from "@/server/security/auth-rate-limit";
import { getRuntimeEnvironmentVariable } from "@/server/infrastructure/cloudflare-bindings";

const loginSchema = z.object({
  identifier: z.string().max(254, "Tên đăng nhập hoặc email không hợp lệ.").trim().min(3, "Nhập tên đăng nhập hoặc email."),
  password: z.string().min(1, "Nhập mật khẩu.").max(128, "Mật khẩu không hợp lệ.")
});

const invitationSchema = z.object({
  token: z.string().min(20, "Lời mời không hợp lệ.").max(256, "Lời mời không hợp lệ."),
  displayName: z.string().max(100, "Họ tên không được vượt quá 100 ký tự.").trim().min(2, "Họ tên phải có ít nhất 2 ký tự."),
  password: z.string().min(12, "Mật khẩu phải có ít nhất 12 ký tự.").max(128, "Mật khẩu không được vượt quá 128 ký tự."),
  confirmPassword: z.string().min(1, "Nhập lại mật khẩu.").max(128, "Mật khẩu không được vượt quá 128 ký tự.")
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "Mật khẩu nhập lại chưa khớp."
});

export async function loginAction(formData: FormData) {
  const returnTo = formData.get("returnTo");
  const partnerPortal = returnTo === "/dat-hang" ? { path: "/dat-hang", role: "customer" as const, loginPath: "/khach-hang/dang-nhap" }
    : returnTo === "/khach-hang" ? { path: "/khach-hang", role: "customer" as const, loginPath: "/khach-hang/dang-nhap" }
    : returnTo === "/nha-cung-cap" ? { path: "/nha-cung-cap", role: "supplier" as const, loginPath: "/nha-cung-cap/dang-nhap" }
      : undefined;
  let error: string | undefined;
  try {
    const input = loginSchema.parse({
      identifier: formData.get("identifier"),
      password: formData.get("password")
    });
    const clientAddress = getTrustedClientAddress(await headers());
    authenticationRateLimiter.assertAllowed(input.identifier, clientAddress);
    let user;
    try {
      user = await identityService.authenticate(input.identifier, input.password);
    } catch (authenticationError) {
      authenticationRateLimiter.recordFailure(input.identifier, clientAddress);
      throw authenticationError;
    }
    authenticationRateLimiter.recordSuccess(input.identifier, clientAddress);
    if (partnerPortal && user.role !== partnerPortal.role) {
      throw new IdentityPublicError("Tài khoản này chưa được cấp quyền truy cập cổng đối tác tương ứng.");
    }
    await establishIdentitySession(user);
  } catch (caught) {
    console.error("Login action failed", caught);
    error = expectedAuthError(caught, "Không thể đăng nhập.");
  }

  if (error) {
    const loginPath = partnerPortal?.loginPath ?? "/login";
    const returnQuery = partnerPortal ? `&returnTo=${encodeURIComponent(partnerPortal.path)}` : "";
    redirect(`${loginPath}?error=${encodeURIComponent(error)}${returnQuery}`);
  }
  redirect(partnerPortal?.path ?? "/");
}

export async function logoutAction() {
  await clearIdentitySession();
  redirect("/login");
}

export async function acceptInvitationAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  let error: string | undefined;
  try {
    const input = invitationSchema.parse({
      token,
      displayName: formData.get("displayName"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword")
    });
    const user = await identityService.acceptInvitation(input.token, input.displayName, input.password);
    await establishIdentitySession(user);
  } catch (caught) {
    error = expectedAuthError(caught, "Không thể kích hoạt tài khoản.");
  }

  if (error) {
    redirect(`/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(error)}`);
  }
  redirect("/");
}

const ownerRecoverySchema = z.object({
  token: z.string().trim().min(16, "Khóa khôi phục phải có ít nhất 16 ký tự.").max(256, "Khóa khôi phục không hợp lệ."),
  identifier: z.string().min(3, "Tên đăng nhập mới phải có từ 3 đến 254 ký tự.").max(254, "Tên đăng nhập mới phải có từ 3 đến 254 ký tự."),
  password: z.string().min(12, "Mật khẩu mới phải có ít nhất 12 ký tự.").max(128, "Mật khẩu không được vượt quá 128 ký tự."),
  confirmPassword: z.string().min(1, "Nhập lại mật khẩu mới.").max(128, "Mật khẩu không được vượt quá 128 ký tự.")
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "Mật khẩu nhập lại chưa khớp."
});

export async function recoverOwnerAction(formData: FormData) {
  let error: string | undefined;
  try {
    const input = ownerRecoverySchema.parse({
      token: formData.get("token"),
      identifier: formData.get("identifier"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword")
    });
    const expectedToken = getRuntimeEnvironmentVariable("ERP_OWNER_RECOVERY_TOKEN")?.trim();
    if (!expectedToken) {
      throw new Error("Hệ thống chưa cấu hình khóa khôi phục owner.");
    }
    await identityService.recoverOwnerCredentials({
      recoveryToken: input.token,
      expectedRecoveryToken: expectedToken,
      identifier: input.identifier,
      password: input.password
    });
  } catch (caught) {
    error = expectedAuthError(caught, "Không thể khôi phục tài khoản owner.");
  }

  if (error) {
    redirect(`/recover-owner?error=${encodeURIComponent(error)}`);
  }
  redirect("/login?message=Đã khôi phục tài khoản chủ thành công. Vui lòng đăng nhập bằng thông tin mới.");
}

function expectedAuthError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? fallback;
  }
  return isIdentityPublicError(error) ? error.message : fallback;
}
