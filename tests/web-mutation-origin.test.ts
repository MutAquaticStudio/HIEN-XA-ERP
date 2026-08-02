import { describe, expect, it } from "vitest";
import { PublicApiError } from "@/server/shared/public-api-error";
import { assertWebMutationOrigin } from "@/server/shared/web-mutation-origin";

describe("web mutation origin boundary", () => {
  it("rejects a cookie request without Origin", () => {
    expect(() => assertWebMutationOrigin(new Request("https://erp.example.test/api/messages", {
      method: "POST",
      headers: { host: "erp.example.test" }
    }))).toThrow(PublicApiError);
  });

  it("accepts a matching browser origin and a native Bearer request", () => {
    expect(() => assertWebMutationOrigin(new Request("https://erp.example.test/api/messages", {
      method: "POST",
      headers: { host: "erp.example.test", origin: "https://erp.example.test" }
    }))).not.toThrow();
    expect(() => assertWebMutationOrigin(new Request("https://erp.example.test/api/messages", {
      method: "POST",
      headers: { host: "erp.example.test", authorization: "Bearer native-token" }
    }))).not.toThrow();
  });

  it("rejects a cross-origin request", () => {
    expect(() => assertWebMutationOrigin(new Request("https://erp.example.test/api/messages", {
      method: "POST",
      headers: { host: "erp.example.test", origin: "https://attacker.example" }
    }))).toThrow("Yêu cầu không đúng nguồn gửi.");
  });
});
