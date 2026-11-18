/**
 * Pembaca CBOR minimal untuk attestationObject dan kunci COSE WebAuthn: bilangan bulat, byte string,
 * teks, array, map. Tipe lain (float, tag) tidak dipakai dan ditolak.
 */
export type CborValue = number | bigint | Uint8Array | string | CborValue[] | Map<CborValue, CborValue> | boolean | null

export function decodeCbor(buf: Uint8Array): CborValue {
  const r = readItem(buf, 0)
  return r.value
}

/** Membaca satu item dan mengembalikan nilai serta posisi berikutnya. */
export function readItem(buf: Uint8Array, start: number, depth = 0): { value: CborValue; end: number } {
  if (depth > 8) throw new Error('CBOR terlalu dalam')
  if (start >= buf.length) throw new Error('CBOR terpotong')
  const ib = buf[start]
  const major = ib >> 5
  const info = ib & 0x1f
  let pos = start + 1
  let arg: number
  if (info < 24) arg = info
  else if (info === 24) {
    arg = buf[pos]
    pos += 1
  } else if (info === 25) {
    arg = (buf[pos] << 8) | buf[pos + 1]
    pos += 2
  } else if (info === 26) {
    arg = ((buf[pos] << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3]) >>> 0
    pos += 4
  } else throw new Error('CBOR: panjang tidak didukung')
  if (Number.isNaN(arg)) throw new Error('CBOR terpotong')

  switch (major) {
    case 0:
      return { value: arg, end: pos }
    case 1:
      return { value: -1 - arg, end: pos }
    case 2: {
      if (pos + arg > buf.length) throw new Error('CBOR terpotong')
      return { value: buf.slice(pos, pos + arg), end: pos + arg }
    }
    case 3: {
      if (pos + arg > buf.length) throw new Error('CBOR terpotong')
      return { value: new TextDecoder().decode(buf.slice(pos, pos + arg)), end: pos + arg }
    }
    case 4: {
      const out: CborValue[] = []
      for (let i = 0; i < arg; i++) {
        const it = readItem(buf, pos, depth + 1)
        out.push(it.value)
        pos = it.end
      }
      return { value: out, end: pos }
    }
    case 5: {
      const m = new Map<CborValue, CborValue>()
      for (let i = 0; i < arg; i++) {
        const k = readItem(buf, pos, depth + 1)
        const v = readItem(buf, k.end, depth + 1)
        m.set(k.value, v.value)
        pos = v.end
      }
      return { value: m, end: pos }
    }
    case 7:
      if (info === 20) return { value: false, end: pos }
      if (info === 21) return { value: true, end: pos }
      if (info === 22) return { value: null, end: pos }
      throw new Error('CBOR: tipe sederhana tidak didukung')
    default:
      throw new Error('CBOR: tipe tidak didukung')
  }
}
