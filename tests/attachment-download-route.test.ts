import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentIdentityUser: vi.fn(),
  getSnapshot: vi.fn(),
  readAttachment: vi.fn()
}));

vi.mock("@/server/identity/auth-context", () => ({
  getCurrentIdentityUser: mocks.getCurrentIdentityUser
}));

vi.mock("@/modules/operations/demo-store", () => ({
  getDemoOperationsSnapshot: mocks.getSnapshot
}));

vi.mock("@/server/infrastructure/operations-attachment-store", () => ({
  readOperationsDocumentImage: mocks.readAttachment
}));

import { GET } from "@/app/api/operations/attachments/[id]/route";

const attachment = {
  id: "11111111-1111-4111-8111-111111111111",
  fileName: "bang_chung.png",
  contentType: "image/png",
  size: 3,
  sha256: "a".repeat(64),
  uploadedBy: "customer-1",
  uploadedAt: "2026-07-27T10:00:00.000Z"
};

function snapshotWith({ financial = false } = {}) {
  return {
    state: {
      approvalRequests: financial ? [] : [{ submittedBy: "customer-1", attachments: [attachment] }],
      salesOrders: [],
      purchaseOrders: [],
      bankTransferProofs: financial ? [{ attachments: [attachment] }] : []
    }
  };
}

describe("operations attachment download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSnapshot.mockResolvedValue(snapshotWith());
    mocks.readAttachment.mockResolvedValue(Buffer.from([1, 2, 3]));
  });

  it("rejects an unauthenticated request before reading document metadata", async () => {
    mocks.getCurrentIdentityUser.mockResolvedValue(undefined);

    const response = await GET(new Request("https://erp.example.test/api/operations/attachments/" + attachment.id), {
      params: Promise.resolve({ id: attachment.id })
    });

    expect(response.status).toBe(401);
    expect(mocks.getSnapshot).not.toHaveBeenCalled();
  });

  it("hides malformed or unknown attachment identifiers", async () => {
    mocks.getCurrentIdentityUser.mockResolvedValue({ id: "owner-1", role: "owner" });

    const response = await GET(new Request("https://erp.example.test/api/operations/attachments/not-an-id"), {
      params: Promise.resolve({ id: "not-an-id" })
    });

    expect(response.status).toBe(404);
    expect(mocks.getSnapshot).not.toHaveBeenCalled();
  });

  it("allows the uploader to read their non-financial attachment with private safe headers", async () => {
    mocks.getCurrentIdentityUser.mockResolvedValue({ id: "customer-1", role: "customer" });

    const response = await GET(new Request("https://erp.example.test/api/operations/attachments/" + attachment.id), {
      params: Promise.resolve({ id: attachment.id })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe("3");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));
  });

  it("forbids a worker from reading financial transfer proof attachments", async () => {
    mocks.getCurrentIdentityUser.mockResolvedValue({ id: "worker-1", role: "worker" });
    mocks.getSnapshot.mockResolvedValue(snapshotWith({ financial: true }));

    const response = await GET(new Request("https://erp.example.test/api/operations/attachments/" + attachment.id), {
      params: Promise.resolve({ id: attachment.id })
    });

    expect(response.status).toBe(403);
    expect(mocks.readAttachment).not.toHaveBeenCalled();
  });

  it("allows accountants to read financial proof attachments but maps missing storage to not found", async () => {
    mocks.getCurrentIdentityUser.mockResolvedValue({ id: "accountant-1", role: "accountant" });
    mocks.getSnapshot.mockResolvedValue(snapshotWith({ financial: true }));
    mocks.readAttachment.mockRejectedValue(new Error("missing"));

    const response = await GET(new Request("https://erp.example.test/api/operations/attachments/" + attachment.id), {
      params: Promise.resolve({ id: attachment.id })
    });

    expect(response.status).toBe(404);
    expect(mocks.readAttachment).toHaveBeenCalledWith(attachment);
  });
});
