/** Kesalahan yang dipahami klien: status HTTP, kode singkat, dan pesan Indonesia. */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export type Body = Record<string, unknown>

export function str(body: Body, key: string, opt: { min?: number; max?: number; label?: string } = {}): string {
  const label = opt.label ?? key
  const v = body[key]
  if (typeof v !== 'string') throw new HttpError(400, 'bad_request', `${label} wajib diisi.`)
  const t = v.trim()
  if (t.length < (opt.min ?? 1)) throw new HttpError(400, 'bad_request', `${label} wajib diisi.`)
  if (t.length > (opt.max ?? 200)) throw new HttpError(400, 'bad_request', `${label} terlalu panjang.`)
  return t
}

export function optStr(body: Body, key: string, max: number, label = key): string | undefined {
  if (body[key] === undefined) return undefined
  if (typeof body[key] !== 'string') throw new HttpError(400, 'bad_request', `${label} tidak valid.`)
  const t = (body[key] as string).trim()
  if (t.length > max) throw new HttpError(400, 'bad_request', `${label} terlalu panjang.`)
  return t
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Email kontak selalu disimpan huruf kecil; boleh kosong. */
export function optEmail(body: Body, key: string): string | undefined {
  const v = optStr(body, key, 200, 'Email')
  if (v === undefined) return undefined
  const e = v.toLowerCase()
  if (e && !EMAIL.test(e)) throw new HttpError(400, 'bad_request', 'Email tidak valid.')
  return e
}

/** Satu-satunya aturan password: minimal 6 karakter (batas Firebase). */
export function password(body: Body, key = 'password'): string {
  const v = body[key]
  if (typeof v !== 'string' || v.length < 6) throw new HttpError(400, 'bad_request', 'Password minimal 6 karakter.')
  if (v.length > 1000) throw new HttpError(400, 'bad_request', 'Password terlalu panjang.')
  return v
}
