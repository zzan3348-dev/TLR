import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest, ApiResponse } from "../server/types";
import { createEmptyEventDraft } from "../src/features/management/types";
import { eventImageError, EVENT_IMAGE_MAX_BYTES } from "../src/features/management/imageUpload";

const mocks = vi.hoisted(() => ({ authorized: true, from: vi.fn(), storage: vi.fn(), saved: [] as Array<Record<string, unknown>>, choices: [] as unknown[] }));
vi.mock("../server/adminAuth.js", () => ({ requireAdminSession: (_request: unknown, response: ApiResponse) => {
  if (mocks.authorized) return { role: "admin" };
  response.status(404).json({ error: "NOT_FOUND" });
  return null;
} }));
vi.mock("../server/auth.js", () => ({ getServerEnv: () => ({}), getAdminClient: () => ({ from: mocks.from, storage: { from: mocks.storage } }) }));
import handler from "../server/routes/admin/contentStudio";

async function call(body: unknown) {
  let status = 0;
  let payload: unknown;
  const response = { status: (code: number) => { status = code; return response; }, json: (data: unknown) => { payload = data; } };
  await handler({ method: "POST", headers: {}, body } as ApiRequest, response as unknown as ApiResponse);
  return { status, payload };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorized = true;
  mocks.saved = [];
  mocks.choices = [];
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      maybeSingle: async () => ({ data: { payload: { legacyMetadata: { retain: true }, image: "old-image.png" } }, error: null }),
      returns: async () => ({ data: [], error: null }),
      upsert: async (value: Record<string, unknown>) => { mocks.saved.push(value); return { error: null }; },
      delete: () => ({ eq: async () => ({ error: null }) }),
      insert: async (values: unknown[]) => { if (table === "event_choices") mocks.choices = values; return { error: null }; },
    };
    return query;
  });
  mocks.storage.mockReturnValue({ createSignedUploadUrl: async (path: string) => ({ data: { signedUrl: `https://storage.test/${path}` }, error: null }), getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/public/${path}` } }) });
});

describe("content studio preservation", () => {
  it("retains zero crop coordinates, effects, deliveries and unknown stored metadata when saving", async () => {
    const event = createEmptyEventDraft();
    event.id = "preservation_test";
    event.imageCrop = { x: 0, y: 0, scale: 1 };
    event.image = "https://example.com/image.png";
    event.choices[0].effects = [{ type: "modify_country_value", targetCountryIds: ["country-013"], statKey: "stability", amount: 5 }];
    event.deliveries = [{ id: "delivery_1", countryKey: "country-013", availableWorldDate: "1932-01-01", createdAt: "2026-09-10" }];
    expect((await call({ action: "SAVE_EVENT", event })).status).toBe(200);
    expect(mocks.saved[0].payload).toMatchObject({ image: event.image, imageCrop: event.imageCrop, deliveries: event.deliveries, legacyMetadata: { retain: true } });
    expect(mocks.choices[0]).toMatchObject({ effects: event.choices[0].effects });
  });
  it("clears a removed image while preserving other metadata", async () => {
    await call({ action: "SAVE_EVENT", event: createEmptyEventDraft() });
    expect(mocks.saved[0].payload).toMatchObject({ image: null, legacyMetadata: { retain: true } });
  });
  it("clones maximum length identifiers without collisions and clears delivery history", async () => {
    const event = { ...createEmptyEventDraft(), id: "e".repeat(80) };
    await call({ action: "CLONE_EVENT", event });
    await call({ action: "CLONE_EVENT", event });
    expect(mocks.saved[0].id).not.toBe(mocks.saved[1].id);
    expect(String(mocks.saved[0].id).length).toBeLessThanOrEqual(80);
    expect(mocks.saved[0]).toMatchObject({ status: "DRAFT", payload: { deliveries: [] } });
  });
  it("requires administrator authorization before signing an upload", async () => {
    mocks.authorized = false;
    expect((await call({ action: "UPLOAD_EVENT_IMAGE", eventId: "test_event", contentType: "image/png", size: 100 })).status).toBe(404);
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("rejects invalid file types, oversized files and path traversal before storage access", async () => {
    for (const input of [{ eventId: "../other", contentType: "image/png", size: 10 }, { eventId: "test_event", contentType: "image/svg+xml", size: 10 }, { eventId: "test_event", contentType: "image/png", size: EVENT_IMAGE_MAX_BYTES + 1 }]) {
      expect((await call({ action: "UPLOAD_EVENT_IMAGE", ...input })).status).toBe(400);
    }
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("signs unique image paths without overwriting the currently published image", async () => {
    const request = { action: "UPLOAD_EVENT_IMAGE", eventId: "test_event", contentType: "image/png", size: 100 };
    const a = await call(request);
    const b = await call(request);
    expect(a.status).toBe(200);
    expect(a.payload).not.toEqual(b.payload);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("validates files client side with the same limits", () => {
    expect(eventImageError("image/png", EVENT_IMAGE_MAX_BYTES)).toBeNull();
    expect(eventImageError("image/png", 0)).not.toBeNull();
    expect(eventImageError("image/svg+xml", 100)).not.toBeNull();
  });
});
