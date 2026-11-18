/** Mengunduh Blob sebagai berkas di perangkat. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Memuat gambar sebagai data URL (untuk kop PDF). Mengembalikan undefined bila gagal. */
export async function imageDataUrl(src: string): Promise<string | undefined> {
  try {
    const blob = await (await fetch(src)).blob()
    return await new Promise<string>((res, rej) => {
      const fr = new FileReader()
      fr.onload = () => res(String(fr.result))
      fr.onerror = () => rej(fr.error)
      fr.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}
