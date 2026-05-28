/**
 * Minimal proto3 wire-format writer for the handful of Farcaster Message /
 * MessageData / body shapes we need to encode. Hand-rolled to keep
 * @quilibrium/quorum-shared free of a runtime proto dependency.
 *
 * Wire types:
 *   0 = varint (uint32/uint64/int32/int64 — no zigzag for plain int*)
 *   2 = length-delimited (bytes, string, sub-message, packed repeated)
 *
 * Tag layout: (field_number << 3) | wire_type, then varint-encoded.
 */

export class ProtoWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;

  bytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  /** Append a raw chunk (used by varint, fixed bytes). */
  push(chunk: Uint8Array): void {
    this.chunks.push(chunk);
    this.length += chunk.length;
  }

  varint(value: number | bigint): void {
    // Convert to bigint for safe handling of u64.
    let v = typeof value === 'bigint' ? value : BigInt(value);
    if (v < 0n) throw new Error('varint encoder does not support negative values without zigzag');
    const out: number[] = [];
    while (v >= 0x80n) {
      out.push(Number((v & 0x7fn) | 0x80n));
      v >>= 7n;
    }
    out.push(Number(v));
    this.push(new Uint8Array(out));
  }

  /** Encode an `int32` (signed) — proto3 wire is plain two's-complement
   *  truncated to a 10-byte varint when negative. We support only the
   *  non-negative case for our use (KeyAddBody.scopes are message-type
   *  enums, all >= 0). */
  int32(value: number): void {
    if (value < 0) {
      // Two's complement extension to 64 bits, then varint-encoded.
      let v = BigInt.asUintN(64, BigInt(value));
      const out: number[] = [];
      while (v >= 0x80n) {
        out.push(Number((v & 0x7fn) | 0x80n));
        v >>= 7n;
      }
      out.push(Number(v));
      this.push(new Uint8Array(out));
      return;
    }
    this.varint(value);
  }

  /** Write a tag byte for (field_number, wire_type). */
  tag(field: number, wireType: 0 | 1 | 2 | 5): void {
    this.varint((field << 3) | wireType);
  }

  writeVarintField(field: number, value: number | bigint): void {
    this.tag(field, 0);
    this.varint(value);
  }

  writeInt32Field(field: number, value: number): void {
    this.tag(field, 0);
    this.int32(value);
  }

  writeBytesField(field: number, value: Uint8Array): void {
    this.tag(field, 2);
    this.varint(value.length);
    this.push(value);
  }

  writeStringField(field: number, value: string): void {
    if (value.length === 0) return; // proto3 default
    this.writeBytesField(field, new TextEncoder().encode(value));
  }

  /** Write a sub-message: encodes payload as length-delimited. */
  writeSubMessage(field: number, payload: Uint8Array): void {
    this.tag(field, 2);
    this.varint(payload.length);
    this.push(payload);
  }

  /** Packed repeated varint (uint32 / uint64). */
  writePackedVarint(field: number, values: (number | bigint)[]): void {
    if (values.length === 0) return;
    const inner = new ProtoWriter();
    for (const v of values) inner.varint(v);
    const packed = inner.bytes();
    this.tag(field, 2);
    this.varint(packed.length);
    this.push(packed);
  }

  /** Packed repeated int32. */
  writePackedInt32(field: number, values: number[]): void {
    if (values.length === 0) return;
    const inner = new ProtoWriter();
    for (const v of values) inner.int32(v);
    const packed = inner.bytes();
    this.tag(field, 2);
    this.varint(packed.length);
    this.push(packed);
  }
}
