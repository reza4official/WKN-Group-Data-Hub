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

/** Tanggal kalender YYYY-MM-DD yang valid. */
export function isoDate(body: Body, key: string, label = key): string | undefined {
  const v = body[key]
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, 'bad_request', `${label} harus berformat YYYY-MM-DD.`)
  const d = new Date(`${v}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new HttpError(400, 'bad_request', `${label} bukan tanggal yang valid.`)
  return v
}

/**
 * Tanggal hari ini menurut WITA (Asia/Makassar, UTC+8, tanpa waktu musim panas). Worker berjalan di UTC,
 * sehingga antara 00:00 dan 08:00 WITA tanggal UTC masih kemarin dan entri hari ini akan salah ditolak.
 */
export function todayWita(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
}

/** Jumlah: bilangan hingga, tidak negatif, maksimal 3 desimal, di bawah 1 miliar. */
export function quantity(body: Body, key: string, label = key): number {
  const v = body[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(400, 'bad_request', `${label} harus berupa angka.`)
  if (v < 0) throw new HttpError(400, 'bad_request', `${label} tidak boleh negatif.`)
  if (v >= 1_000_000_000) throw new HttpError(400, 'bad_request', `${label} terlalu besar.`)
  if (Math.abs(Math.round(v * 1000) / 1000 - v) > 1e-9) throw new HttpError(400, 'bad_request', `${label} maksimal 3 angka desimal.`)
  return Math.round(v * 1000) / 1000
}

export function oneOf<T extends string>(body: Body, key: string, allowed: readonly T[], label = key): T {
  const v = body[key]
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw new HttpError(400, 'bad_request', `${label} tidak valid.`)
  return v as T
}

export function strArray(body: Body, key: string, max = 30, label = key): string[] | undefined {
  const v = body[key]
  if (v === undefined) return undefined
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x || x.length > 100)) throw new HttpError(400, 'bad_request', `${label} tidak valid.`)
  const u = [...new Set(v as string[])]
  if (u.length > max) throw new HttpError(400, 'bad_request', `${label} terlalu banyak (maksimal ${max}).`)
  return u
}
