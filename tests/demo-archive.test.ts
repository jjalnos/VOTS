import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as archiveGet, POST as archivePost } from "@/app/api/demo/archive/route";
import { GET as contentGet } from "@/app/api/demo/archive/[id]/content/route";
import { POST as textClearancePost } from "@/app/api/demo/archive/[id]/text-clearance/route";
import { SESSION_COOKIE } from "@/lib/auth/server-session";
import { signSession } from "@/lib/auth/session-token";
import {
  decryptDemoArchiveContent,
  encryptDemoArchiveContent,
} from "@/lib/demo-archive/crypto";
import {
  createMemoryDemoArchiveStore,
  setDemoArchiveStoreForTests,
  type DemoArchiveStore,
} from "@/lib/demo-archive/store";
import type { DemoArchiveStoredRecord } from "@/lib/demo-archive/types";
import {
  DEMO_ARCHIVE_LIMITED_TEXT_REVIEW_MAX_BYTES,
  reviewLimitedArchiveText,
  validateDemoArchiveFile,
} from "@/lib/demo-archive/validation";

const ORIGIN = "https://archive.example";
const SESSION_SECRET = "test-session-secret-longer-than-thirty-two-characters";
let store: DemoArchiveStore;

function sessionCookie(
  userId = "user-curator-demo",
  roles: Array<"admin" | "curator" | "family"> = ["curator"],
  mfaVerified = true,
): string {
  const now = Date.now();
  const token = signSession(
    {
      userId,
      email: `${userId}@archive.local`,
      displayName: userId,
      roles,
      mfaVerified,
      sessionVersion: 1,
      issuedAt: now - 1_000,
      expiresAt: now + 60_000,
    },
    SESSION_SECRET,
  );
  return `${SESSION_COOKIE}=${token}`;
}

function textClearanceRequest(
  id: string,
  options: {
    cookie?: string;
    origin?: string;
    body?: unknown;
  } = {},
): Request {
  return new Request(`${ORIGIN}/api/demo/archive/${id}/text-clearance`, {
    method: "POST",
    headers: {
      Origin: options.origin ?? ORIGIN,
      Cookie: options.cookie ?? sessionCookie(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options.body ?? {
      confirmed: true,
      acknowledgement: "RUN_LIMITED_TEXT_SAFETY_REVIEW",
    }),
  });
}

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    clientId: randomUUID(),
    survivorName: "Stephan Jalnos",
    title: "Family recollection notes",
    itemType: "document",
    sourceContributor: "Robin Black",
    originalLanguage: "English",
    consentRights: "Museum review required",
    rightsStatement: "Private research material; do not publish without curator approval.",
    notes: "Interview follow-up and chapter research.",
    tags: ["family", "chapter two"],
    visibility: "private",
    ...overrides,
  };
}

function uploadRequest(
  file: File,
  options: {
    cookie?: string;
    metadata?: Record<string, unknown>;
    origin?: string;
    idempotencyKey?: string;
  } = {},
): Request {
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata(options.metadata)));
  form.append("files", file);
  const headers = new Headers({
    Origin: options.origin ?? ORIGIN,
    Cookie: options.cookie ?? sessionCookie(),
    "Idempotency-Key": options.idempotencyKey ?? randomUUID(),
  });
  return new Request(`${ORIGIN}/api/demo/archive`, {
    method: "POST",
    headers,
    body: form,
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AUTH_PROVIDER", "development");
  vi.stubEnv("DEV_AUTH_ENABLED", "true");
  vi.stubEnv("STAFF_MFA_REQUIRED", "false");
  vi.stubEnv("AUTH_SESSION_SECRET", SESSION_SECRET);
  vi.stubEnv("DEMO_ARCHIVE_MASTER_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("DEMO_ARCHIVE_KEY_VERSION", "1");
  store = createMemoryDemoArchiveStore();
  setDemoArchiveStoreForTests(store);
});

afterEach(() => {
  setDemoArchiveStoreForTests(undefined);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("authenticated encrypted Robin archive", () => {
  it("requires a curator session for listing and upload", async () => {
    const listed = await archiveGet(new Request(`${ORIGIN}/api/demo/archive`));
    expect(listed.status).toBe(401);

    const family = await archiveGet(
      new Request(`${ORIGIN}/api/demo/archive`, {
        headers: { Cookie: sessionCookie("user-family-demo", ["family"]) },
      }),
    );
    expect(family.status).toBe(403);

    const upload = await archivePost(
      uploadRequest(new File(["private"], "private.txt"), { cookie: "" }),
    );
    expect(upload.status).toBe(401);
  });

  it("stores, searches, paginates, and replays one private original without network AI", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    const idempotencyKey = randomUUID();
    const file = new File(
      ["Stephan described a family recollection for Robin's manuscript."],
      "recollection.txt",
      { type: "text/plain" },
    );
    const firstRequest = uploadRequest(file, { idempotencyKey });
    const uploaded = await archivePost(firstRequest);
    const uploadPayload = await uploaded.json();

    expect(uploaded.status).toBe(201);
    expect(uploadPayload.accepted).toHaveLength(1);
    expect(uploadPayload.accepted[0].record).toMatchObject({
      title: "Family recollection notes",
      survivorName: "Stephan Jalnos",
      itemType: "document",
      visibility: "private",
      status: "needs-review",
      extractionStatus: "text-ready",
      scanStatus: "quarantined",
      originalFilename: "recollection.txt",
    });
    expect(uploadPayload.accepted[0].record).not.toHaveProperty("workspaceId");
    expect(uploadPayload.accepted[0].record).not.toHaveProperty("checksumSha256");
    expect(uploadPayload.accepted[0].record).not.toHaveProperty("extractedText");

    const listed = await archiveGet(
      new Request(`${ORIGIN}/api/demo/archive?q=recollection&page=1&pageSize=1`, {
        headers: { Cookie: sessionCookie() },
      }),
    );
    const listPayload = await listed.json();
    expect(listPayload).toMatchObject({ total: 1, page: 1, pageSize: 1, totalPages: 1 });
    expect(listPayload.items[0].title).toBe("Family recollection notes");
    expect(listPayload.facets.survivors).toEqual(["Stephan Jalnos"]);

    const replayed = await archivePost(uploadRequest(file, { idempotencyKey }));
    expect(replayed.status).toBe(200);
    expect(await replayed.json()).toMatchObject({ replayed: true });
    const conflictingRetry = await archivePost(
      uploadRequest(new File(["different bytes"], "different.txt"), {
        idempotencyKey,
        metadata: { title: "Changed metadata" },
      }),
    );
    expect(conflictingRetry.status).toBe(409);
    expect((await conflictingRetry.json()).rejected[0].reason).toMatch(/retry key/i);
    expect(network).not.toHaveBeenCalled();
  });

  it("keeps non-text originals quarantined and isolates another curator", async () => {
    const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const uploaded = await archivePost(
      uploadRequest(new File([imageBytes], "private.jpg", { type: "image/jpeg" }), {
        metadata: { itemType: "photograph" },
      }),
    );
    const payload = await uploaded.json();
    const id = payload.accepted[0].record.id as string;
    const context = { params: Promise.resolve({ id }) };

    const quarantined = await contentGet(
      new Request(`${ORIGIN}/api/demo/archive/${id}/content`, {
        headers: { Cookie: sessionCookie() },
      }),
      context,
    );
    expect(quarantined.status).toBe(423);
    expect(await quarantined.json()).toMatchObject({ scanStatus: "quarantined" });

    const other = await contentGet(
      new Request(`${ORIGIN}/api/demo/archive/${id}/content`, {
        headers: { Cookie: sessionCookie("user-other-curator", ["curator"]) },
      }),
      context,
    );
    expect(other.status).toBe(404);
  });

  it("keeps validated plain text encrypted and quarantined without exposing a plaintext field", async () => {
    const uploaded = await archivePost(
      uploadRequest(new File(["private archive text"], "private.txt")),
    );
    const payload = await uploaded.json();
    const record = payload.accepted[0].record as { id: string; scanStatus: string };
    expect(record.scanStatus).toBe("quarantined");
    expect(payload.accepted[0].record).not.toHaveProperty("extractedText");

    const response = await contentGet(
      new Request(`${ORIGIN}/api/demo/archive/${record.id}/content`, {
        headers: { Cookie: sessionCookie() },
      }),
      { params: Promise.resolve({ id: record.id }) },
    );
    expect(response.status).toBe(423);
    expect(await response.json()).toMatchObject({ scanStatus: "quarantined" });
  });

  it("rejects cross-site, duplicate, mismatched, and declared-oversize uploads", async () => {
    const original = new File(["unique private notes"], "notes.txt", {
      type: "text/plain",
    });
    const crossSite = await archivePost(
      uploadRequest(original, { origin: "https://attacker.example" }),
    );
    expect(crossSite.status).toBe(403);

    const first = await archivePost(uploadRequest(original));
    expect(first.status).toBe(201);
    const duplicate = await archivePost(uploadRequest(original));
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).rejected[0].reason).toMatch(/already in/i);

    const disguised = new File(["%PDF-not-an-image"], "disguised.jpg", {
      type: "image/jpeg",
    });
    const mismatch = await archivePost(
      uploadRequest(disguised, { metadata: { itemType: "photograph" } }),
    );
    expect(mismatch.status).toBe(400);
    expect((await mismatch.json()).rejected[0].reason).toMatch(/do not match/i);

    const oversize = await archivePost(
      new Request(`${ORIGIN}/api/demo/archive`, {
        method: "POST",
        headers: {
          Origin: ORIGIN,
          Cookie: sessionCookie(),
          "Idempotency-Key": randomUUID(),
          "Content-Type": "multipart/form-data; boundary=bounded",
          "Content-Length": String(10 * 1024 * 1024),
        },
        body: "--bounded--\r\n",
      }),
    );
    expect(oversize.status).toBe(413);
  });

  it("accepts real signature families for photographs, audio, and video", () => {
    const cases: Array<{
      itemType: "photograph" | "audio" | "video";
      file: File;
      bytes: Uint8Array;
    }> = [
      {
        itemType: "photograph",
        bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]),
        file: new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])], "family.jpg"),
      },
      {
        itemType: "audio",
        bytes: new TextEncoder().encode("RIFF0000WAVEfmt "),
        file: new File(["RIFF0000WAVEfmt "], "testimony.wav"),
      },
      {
        itemType: "video",
        bytes: new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]),
        file: new File(
          [new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])],
          "interview.mp4",
        ),
      },
    ];
    for (const sample of cases) {
      expect(validateDemoArchiveFile(sample.file, sample.bytes, sample.itemType)).toMatchObject({
        ok: true,
        value: {
          itemType: sample.itemType,
          previewable: true,
          initialScanStatus: "quarantined",
        },
      });
    }
  });

  it("round-trips file bytes through AES-256-GCM with record-bound associated data", () => {
    const content = new TextEncoder().encode("encrypted private oral-history note");
    const encrypted = encryptDemoArchiveContent(content, "workspace", "record");
    expect(encrypted.ciphertext).not.toEqual(Buffer.from(content));
    expect(encrypted.nonce).toHaveLength(12);
    expect(encrypted.authTag).toHaveLength(16);
    expect(
      new TextDecoder().decode(
        decryptDemoArchiveContent({
          ...encrypted,
          workspaceId: "workspace",
          recordId: "record",
        }),
      ),
    ).toBe("encrypted private oral-history note");
    expect(() =>
      decryptDemoArchiveContent({
        ...encrypted,
        workspaceId: "other-workspace",
        recordId: "record",
      }),
    ).toThrow();
  });

  it("enforces the durable store upload counter per authenticated actor", async () => {
    for (let index = 0; index < 24; index += 1) {
      const response = await archivePost(
        uploadRequest(new File([`record-${index}`], `${index}.txt`), {
          metadata: { title: `Record ${index}` },
        }),
      );
      expect(response.status).toBe(201);
    }
    const limited = await archivePost(
      uploadRequest(new File(["limited"], "limited.txt"), {
        metadata: { title: "Limited record" },
      }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});

describe("curator-invoked limited UTF-8 text safety review", () => {
  it("clears one real quarantined text original without network AI and exposes it to the private corpus", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    const content = "Stephan Jalnos was born in Poland, according to Robin's private notes.";
    const uploaded = await archivePost(
      uploadRequest(new File([content], "stephan-notes.txt", { type: "text/plain" })),
    );
    const uploadPayload = await uploaded.json();
    const id = uploadPayload.accepted[0].record.id as string;

    const before = await contentGet(
      new Request(`${ORIGIN}/api/demo/archive/${id}/content`, {
        headers: { Cookie: sessionCookie() },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(before.status).toBe(423);

    const cleared = await textClearancePost(
      textClearanceRequest(id),
      { params: Promise.resolve({ id }) },
    );
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toMatchObject({
      record: {
        id,
        scanStatus: "cleared",
        previewUrl: `/api/demo/archive/${id}/content`,
      },
      clearance: {
        status: "cleared",
        kind: "limited-utf8-text-safety-review",
        antivirusScanPerformed: false,
      },
    });

    const after = await contentGet(
      new Request(`${ORIGIN}/api/demo/archive/${id}/content`, {
        headers: { Cookie: sessionCookie() },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(after.status).toBe(200);
    expect(await after.text()).toBe(content);
    const corpus = await store.corpus("user-curator-demo");
    expect(corpus.find((record) => record.id === id)?.extractedText).toBe(content);
    expect(network).not.toHaveBeenCalled();
  });

  it("requires trusted origin, explicit acknowledgement, curator role, and MFA", async () => {
    const uploaded = await archivePost(
      uploadRequest(new File(["private text"], "private.txt")),
    );
    const id = (await uploaded.json()).accepted[0].record.id as string;
    const context = { params: Promise.resolve({ id }) };

    const crossSite = await textClearancePost(
      textClearanceRequest(id, { origin: "https://attacker.example" }),
      context,
    );
    expect(crossSite.status).toBe(403);

    const unconfirmed = await textClearancePost(
      textClearanceRequest(id, { body: { confirmed: true } }),
      context,
    );
    expect(unconfirmed.status).toBe(400);

    const family = await textClearancePost(
      textClearanceRequest(id, { cookie: sessionCookie("user-family-demo", ["family"]) }),
      context,
    );
    expect(family.status).toBe(403);

    vi.stubEnv("STAFF_MFA_REQUIRED", "true");
    const withoutMfa = await textClearancePost(
      textClearanceRequest(id, {
        cookie: sessionCookie("user-curator-demo", ["curator"], false),
      }),
      context,
    );
    expect(withoutMfa.status).toBe(403);
  });

  it("keeps CSV and deceptive Unicode text quarantined", async () => {
    const csvUpload = await archivePost(
      uploadRequest(new File(["name,year\nStephan,1923"], "notes.csv")),
    );
    const csvId = (await csvUpload.json()).accepted[0].record.id as string;
    const csvReview = await textClearancePost(
      textClearanceRequest(csvId),
      { params: Promise.resolve({ id: csvId }) },
    );
    expect(csvReview.status).toBe(409);
    expect(await csvReview.json()).toMatchObject({ error: expect.stringMatching(/CSV.*quarantined/i) });

    const bidiUpload = await archivePost(
      uploadRequest(new File(["Biography \u202e hidden direction"], "notes.md")),
    );
    const bidiId = (await bidiUpload.json()).accepted[0].record.id as string;
    const bidiReview = await textClearancePost(
      textClearanceRequest(bidiId),
      { params: Promise.resolve({ id: bidiId }) },
    );
    expect(bidiReview.status).toBe(422);
    expect(await bidiReview.json()).toMatchObject({ error: expect.stringMatching(/remains quarantined/i) });
  });

  it("bounds and rejects controls while limiting eligibility to exact txt/md records", () => {
    const textRecord = {
      itemType: "document" as const,
      mimeType: "text/plain; charset=utf-8",
      originalFilename: "notes.txt",
      extractionStatus: "text-ready" as const,
    };
    expect(reviewLimitedArchiveText(textRecord, new TextEncoder().encode("safe private text"))).toMatchObject({ ok: true });
    expect(reviewLimitedArchiveText(textRecord, new TextEncoder().encode("bad\u0000text"))).toEqual({
      ok: false,
      reason: "control-characters",
    });
    expect(reviewLimitedArchiveText(
      textRecord,
      new Uint8Array(DEMO_ARCHIVE_LIMITED_TEXT_REVIEW_MAX_BYTES + 1).fill(65),
    )).toEqual({ ok: false, reason: "oversize" });
    expect(reviewLimitedArchiveText(
      { ...textRecord, originalFilename: "notes.csv", mimeType: "text/csv; charset=utf-8" },
      new TextEncoder().encode("safe,text"),
    )).toEqual({ ok: false, reason: "ineligible-format" });
    expect(reviewLimitedArchiveText(
      {
        ...textRecord,
        itemType: "photograph",
        originalFilename: "photo.jpg",
        mimeType: "image/jpeg",
        extractionStatus: "awaiting-ocr",
      },
      new Uint8Array([0xff, 0xd8, 0xff]),
    )).toEqual({ ok: false, reason: "ineligible-format" });
  });

  it("locks, updates, and audits the PostgreSQL clearance in one transaction", () => {
    const source = readFileSync("src/lib/demo-archive/postgres-store.ts", "utf8");
    const start = source.indexOf("async reviewLimitedText(input)");
    const end = source.indexOf("async consumeUploadLimit", start);
    const workflow = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(workflow).toContain("return sql.begin");
    expect(workflow).toMatch(/FOR UPDATE OF b/);
    expect(workflow).toMatch(/UPDATE demo_archive_blobs[\s\S]*scan_status = 'cleared'/);
    expect(workflow).toMatch(/INSERT INTO demo_archive_audit_events/);
    expect(workflow).toContain("archive.limited_text_safety_review_cleared");
    expect(workflow).toContain("antivirusScanPerformed: false");
  });
});

function clearedRecord(id: string, workspaceId: string): DemoArchiveStoredRecord {
  const createdAt = new Date().toISOString();
  return {
    id,
    workspaceId,
    title: "Cleared private text",
    survivorName: "Sam Cohen",
    itemType: "document",
    mediaType: "document",
    mimeType: "text/plain; charset=utf-8",
    originalFilename: "cleared.txt",
    byteSize: 12,
    fileSize: 12,
    checksumSha256: "a".repeat(64),
    sourceContributor: "Robin Black",
    originalLanguage: "English",
    consentRights: "Museum review required",
    rightsStatement: "Private archive record with cleared safety review.",
    tags: [],
    visibility: "private",
    status: "needs-review",
    reviewStatus: "needs-review",
    extractionStatus: "text-ready",
    scanStatus: "cleared",
    previewable: true,
    createdAt,
    uploadedAt: createdAt,
  };
}

describe("cleared private downloads", () => {
  it("streams only a cleared actor-owned original and supports ranges", async () => {
    const id = randomUUID();
    const content = new TextEncoder().encode("private text");
    await store.insert({
      record: clearedRecord(id, "user-curator-demo"),
      content,
      idempotencyKey: randomUUID(),
      requestFingerprint: "f".repeat(64),
      workspaceQuotaBytes: 1_000_000,
      globalQuotaBytes: 1_000_000,
      maximumRecords: 10,
    });
    const response = await contentGet(
      new Request(`${ORIGIN}/api/demo/archive/${id}/content`, {
        headers: { Cookie: sessionCookie(), Range: "bytes=0-6" },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("content-range")).toBe("bytes 0-6/12");
    expect(await response.text()).toBe("private");
  });
});
