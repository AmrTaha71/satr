// ستر — رمز الإيقاف 4 أرقام (مخطط §7)
// ============================================================
// القاعدة: الرمز يُحفظ كـ Hash مع Salt فقط — الرمز نفسه لا يُحفظ أبدًا.
// التخزين: Keychain (iOS) / Keystore (Android) عبر الوحدة الأصلية.
// هذا الملف: تجزئة SHA-256 خالصة بـ TypeScript (بلا اعتماديات)
// + التحقق بمقارنة ثابتة الزمن. لا رمز نصي يغادر هذه الوحدة.

// --- SHA-256 (تنفيذ خالص من المواصفة، يُختبَر مقابل Node crypto) ---
const K: number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function sha256Hex(input: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0xd800 || code >= 0xe000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else {
      i++;
      const c2 = input.charCodeAt(i);
      const cp = 0x10000 + (((code & 0x3ff) << 10) | (c2 & 0x3ff));
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
  }
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Array<number>(64);
  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = (bytes[chunk + i * 4] << 24) | (bytes[chunk + i * 4 + 1] << 16) | (bytes[chunk + i * 4 + 2] << 8) | bytes[chunk + i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + K[i] + w[i]) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  const hex = (n: number): string => ('00000000' + (n >>> 0).toString(16)).slice(-8);
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
}

// --- رمز الإيقاف ---

export interface StopCodeRecord {
  /** نسخة التجزئة (لتغيير الخوارزمية مستقبلًا دون كسر القديم). */
  version: 1;
  /** Salt عشوائي 16 بايت بصيغة hex. */
  saltHex: string;
  /** sha256(salt + ':' + code) بصيغة hex. الرمز نفسه غير موجود هنا. */
  hashHex: string;
}

/** تحقق من شكل الرمز: 4 أرقام بالضبط (0-9). */
export function isValidStopCode(code: string): boolean {
  return /^\d{4}$/.test(code);
}

export function generateSaltHex(randomBytes: (n: number) => Uint8Array): string {
  const b = randomBytes(16);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function createStopCodeRecord(
  code: string,
  saltHex: string,
): StopCodeRecord {
  if (!isValidStopCode(code)) throw new Error('رمز الإيقاف يجب أن يكون 4 أرقام');
  return { version: 1, saltHex, hashHex: sha256Hex(`${saltHex}:${code}`) };
}

/** مقارنة ثابتة الزمن — لا تُسرّب أي معلومة عن موضع الاختلاف. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function verifyStopCode(code: string, record: StopCodeRecord): boolean {
  if (!isValidStopCode(code)) return false;
  const candidate = sha256Hex(`${record.saltHex}:${code}`);
  return constantTimeEqual(candidate, record.hashHex);
}
