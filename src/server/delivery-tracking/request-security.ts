export function assertTrackingMutationOrigin(request: Request) {
  if (/^Bearer\s+/i.test(request.headers.get("authorization") ?? "")) return;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host.split(",")[0]?.trim()) {
    throw new Error("Yêu cầu theo dõi giao hàng không đúng nguồn gửi.");
  }
}
