// Reads pixel dimensions from image headers without decoding (measured metadata).

export interface Dimensions {
  width: number;
  height: number;
}

export function imageDimensions(b: Uint8Array): Dimensions | null {
  const u16be = (i: number) => (b[i]! << 8) | b[i + 1]!;
  const u32be = (i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
  // PNG: IHDR is the first chunk.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return b.length >= 24 ? { width: u32be(16), height: u32be(20) } : null;
  }
  // JPEG: walk markers to the first SOFn.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = u16be(i + 2);
      if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: u16be(i + 5), width: u16be(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  // WebP: RIFF....WEBP + VP8 / VP8L / VP8X.
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45 && b.length >= 30) {
    const fourcc = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (fourcc === "VP8 ") return { width: ((b[26]! | (b[27]! << 8)) & 0x3fff), height: ((b[28]! | (b[29]! << 8)) & 0x3fff) };
    if (fourcc === "VP8L") {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === "VP8X") {
      return { width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)) };
    }
  }
  return null;
}

export type Aspect = "vertical" | "portrait" | "square" | "landscape";

/** 9:16-ish is "vertical" (Reels/Stories); 4:5 is "portrait" (feed). */
export function aspectOf(d: Dimensions): Aspect {
  const r = d.height / d.width;
  if (r >= 1.6) return "vertical";
  if (r >= 1.1) return "portrait";
  if (r >= 0.9) return "square";
  return "landscape";
}
