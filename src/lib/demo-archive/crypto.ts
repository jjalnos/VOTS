import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { DemoArchiveStoreUnavailableError } from "@/lib/demo-archive/store";

export interface EncryptedArchiveContent {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

function masterKey(): Buffer {
  const configured = process.env.DEMO_ARCHIVE_MASTER_KEY?.trim();
  const decoded = configured ? Buffer.from(configured, "base64") : Buffer.alloc(0);
  if (decoded.byteLength !== 32) {
    throw new DemoArchiveStoreUnavailableError(
      "The private archive encryption key is not configured.",
    );
  }
  return decoded;
}

function keyVersion(): number {
  const parsed = Number(process.env.DEMO_ARCHIVE_KEY_VERSION ?? "1");
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new DemoArchiveStoreUnavailableError(
      "The private archive encryption key version is invalid.",
    );
  }
  return parsed;
}

function associatedData(workspaceId: string, recordId: string): Buffer {
  return Buffer.from(`vots:demo-archive:${workspaceId}:${recordId}`, "utf8");
}

export function encryptDemoArchiveContent(
  content: Uint8Array,
  workspaceId: string,
  recordId: string,
): EncryptedArchiveContent {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), nonce);
  cipher.setAAD(associatedData(workspaceId, recordId));
  const ciphertext = Buffer.concat([cipher.update(content), cipher.final()]);
  return {
    ciphertext,
    nonce,
    authTag: cipher.getAuthTag(),
    keyVersion: keyVersion(),
  };
}

export function decryptDemoArchiveContent(input: {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  authTag: Uint8Array;
  keyVersion: number;
  workspaceId: string;
  recordId: string;
}): Uint8Array<ArrayBuffer> {
  if (input.keyVersion !== keyVersion()) {
    throw new DemoArchiveStoreUnavailableError(
      "This archive record uses an unavailable encryption key version.",
    );
  }
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), input.nonce);
  decipher.setAAD(associatedData(input.workspaceId, input.recordId));
  decipher.setAuthTag(Buffer.from(input.authTag));
  const plaintext = Buffer.concat([
    decipher.update(input.ciphertext),
    decipher.final(),
  ]);
  const result = new Uint8Array(new ArrayBuffer(plaintext.byteLength));
  result.set(plaintext);
  return result;
}
