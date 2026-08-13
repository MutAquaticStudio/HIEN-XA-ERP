export function buildFeedbackRedirect(
  pathname: string,
  kind: "error" | "message",
  message: string,
  additional: Record<string, string> = {}
) {
  const query = new URLSearchParams({ [kind]: message, ...additional });
  return `${pathname}?${query.toString()}`;
}
