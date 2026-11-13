// 极简未压缩 RGB TIFF 编码器(little-endian)
export function encodeTiff(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; j < rgb.length; i += 4, j += 3) {
    rgb[j] = rgba[i]; rgb[j + 1] = rgba[i + 1]; rgb[j + 2] = rgba[i + 2];
  }
  const headerSize = 8;
  const bitsOff = headerSize;                 // 3 个 SHORT,6占 6 字节
  const xresOff = bitsOff + 8;                 // 对齐到 8
  const yresOff = xresOff + 8;
  const imgOff = yresOff + 8;
  const ifdOff = imgOff + rgb.length;
  const entries = 12;
  const total = ifdOff + 2 + entries * 12 + 4;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);

  dv.setUint8(0, 0x49); dv.setUint8(1, 0x49); // II
  dv.setUint16(2, 42, true);
  dv.setUint32(4, ifdOff, true);

  // BitsPerSample = [8,8,8]
  dv.setUint16(bitsOff, 8, true); dv.setUint16(bitsOff + 2, 8, true); dv.setUint16(bitsOff + 4, 8, true);
  // X/YResolution = 600/1
  dv.setUint32(xresOff, 600, true); dv.setUint32(xresOff + 4, 1, true);
  dv.setUint32(yresOff, 600, true); dv.setUint32(yresOff + 4, 1, true);

  u8.set(rgb, imgOff);

  let p = ifdOff;
  dv.setUint16(p, entries, true); p += 2;
  const tag = (id: number, type: number, count: number, value: number) => {
    dv.setUint16(p, id, true);
    dv.setUint16(p + 2, type, true);
    dv.setUint32(p + 4, count, true);
    dv.setUint32(p + 8, value, true);
    p += 12;
  };
  tag(256, 4, 1, w);            // ImageWidth LONG
  tag(257, 4, 1, h);            // ImageLength LONG
  tag(258, 3, 3, bitsOff);      // BitsPerSample SHORT×3 → 偏移
  tag(259, 3, 1, 1);            // Compression = 无
  tag(262, 3, 1, 2);            // Photometric = RGB
  tag(273, 4, 1, imgOff);       // StripOffsets
  tag(277, 3, 1, 3);            // SamplesPerPixel
  tag(278, 4, 1, h);            // RowsPerStrip
  tag(279, 4, 1, rgb.length);   // StripByteCounts
  tag(282, 5, 1, xresOff);      // XResolution RATIONAL
  tag(283, 5, 1, yresOff);      // YResolution RATIONAL
  tag(296, 3, 1, 2);            // ResolutionUnit = inch
  dv.setUint32(p, 0, true);     // 下一个 IFD = 无
  return u8;
}
