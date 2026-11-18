import { api } from './api'

export type PurgeKind = 'project' | 'company'
export interface PurgePreview {
  name: string
  projects: number
  items: number
  transactions: number
  users: number
  deleting: boolean
  estimatedDocs: number
  overDailyLimit: boolean
}
const base = (k: PurgeKind) => (k === 'project' ? '/projects' : '/companies')

export async function previewPurge(kind: PurgeKind, id: string): Promise<PurgePreview> {
  return (await api<{ preview: PurgePreview }>(`${base(kind)}/delete-preview`, { id })).preview
}

/**
 * Menghapus sampai selesai: server menghapus sebagian per pemanggilan (batas Workers gratis) lalu menjawab `done: false`.
 * Bentrokan sesaat ("busy") diulang beberapa kali; kuota habis dan galat lain diteruskan ke pemanggil (dapat dilanjutkan).
 */
export async function runPurge(
  kind: PurgeKind,
  id: string,
  confirmName: string,
  onProgress: (deleted: number, phase: string) => void,
): Promise<void> {
  let total = 0
  let busy = 0
  for (let i = 0; i < 500; i++) {
    try {
      const r = (
        await api<{ purge: { done: boolean; deleted: number; phase: string } }>(`${base(kind)}/delete`, {
          id,
          confirmName,
        })
      ).purge
      busy = 0
      total += r.deleted
      onProgress(total, r.phase)
      if (r.done) return
    } catch (e) {
      if ((e as { code?: string }).code === 'busy' && ++busy < 4) continue
      throw e
    }
  }
  throw new Error(
    'Penghapusan belum selesai setelah banyak putaran. Tekan "Lanjutkan penghapusan" untuk meneruskan.',
  )
}
