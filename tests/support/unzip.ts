import { crc32, inflateRawSync } from "node:zlib";

/**
 * An independent reading of a zip archive for tests: walks the central
 * directory, checks every entry against its local header and CRC-32, and
 * returns the decompressed parts by name. It shares no code with the writer
 * under test or with the registry's own xlsx reader.
 */
export function unzipEntries(archive: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = buffer.length - 22;
  if (end < 0 || buffer.readUInt32LE(end) !== 0x06054b50) {
    throw new Error("The archive does not end with an end-of-central-directory record.");
  }
  const count = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  if (directoryOffset + directorySize !== end) {
    throw new Error("The central directory does not sit directly before the end record.");
  }

  const entries = new Map<string, string>();
  let cursor = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`Central directory entry ${index} has a bad signature.`);
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const checksum = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`${name}: the local header has a bad signature.`);
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const localName = buffer.toString("utf8", localOffset + 30, localOffset + 30 + localNameLength);
    if (localName !== name) throw new Error(`${name}: the local header names ${localName}.`);
    if (
      buffer.readUInt32LE(localOffset + 14) !== checksum ||
      buffer.readUInt32LE(localOffset + 18) !== compressedSize ||
      buffer.readUInt32LE(localOffset + 22) !== size
    ) {
      throw new Error(`${name}: the local header disagrees with the central directory.`);
    }

    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + compressedSize);
    const content = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    if (method !== 0 && method !== 8) throw new Error(`${name}: unsupported method ${method}.`);
    if (content.length !== size) throw new Error(`${name}: the size does not match.`);
    if (crc32(content) !== checksum) throw new Error(`${name}: the CRC-32 does not match.`);

    entries.set(name, content.toString("utf8"));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== end) throw new Error("The central directory length is wrong.");
  return entries;
}
