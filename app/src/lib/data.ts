import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAt,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import type { LedgerEntry, MonthTotals } from './ledger'

export interface Role {
  id: string
  name: string
  level: number
  system: boolean
  perms: string[]
}
export interface UserRow {
  id: string
  username: string
  name: string
  phone: string
  emailContact: string
  roleId: string
  level: number
  disabled: boolean
  projectIds: string[]
}
export interface ResetRequest {
  id: string
  targetUsername: string
  targetName: string
  targetRoleId: string
  requesterLevel: number
  status: 'pending' | 'done'
  requestedAt: unknown
  handledByName: string | null
  handledByRole: string | null
  handledAt: unknown
}
export interface AuditRow {
  id: string
  at: unknown
  actorName: string
  actorUsername: string
  actorRole: string
  action: string
  targetType: string
  targetId: string
  targetLabel: string
  detail: Record<string, unknown>
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export async function listRoles(): Promise<Role[]> {
  const snap = await getDocs(collection(db, 'roles'))
  return snap.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        name: str(x.name),
        level: Number(x.level ?? 0),
        system: x.system === true,
        perms: Array.isArray(x.perms) ? (x.perms as string[]) : [],
      }
    })
    .sort((a, b) => b.level - a.level)
}

/** Kueri HARUS memuat batas level agar lolos Firestore Rules. */
export async function listUsersBelow(level: number, scope?: string[]): Promise<UserRow[]> {
  // scope = proyek pelaku bila ia tidak memegang izin "projects" (lihat semua). Kueri harus memuat batasnya.
  if (scope && scope.length === 0) return []
  const q = scope
    ? query(
        collection(db, 'users'),
        where('level', '<', level),
        where('projectIds', 'array-contains-any', scope.slice(0, 30)),
      )
    : query(collection(db, 'users'), where('level', '<', level))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        username: str(x.username),
        name: str(x.name),
        phone: str(x.phone),
        emailContact: str(x.emailContact),
        roleId: str(x.roleId),
        level: Number(x.level ?? 0),
        disabled: x.disabled === true,
        projectIds: Array.isArray(x.projectIds) ? (x.projectIds as string[]) : [],
      }
    })
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
}

export async function listResetRequests(level: number, scope?: string[]): Promise<ResetRequest[]> {
  if (scope && scope.length === 0) return []
  const q = scope
    ? query(
        collection(db, 'resetRequests'),
        where('requesterLevel', '<', level),
        where('targetProjectIds', 'array-contains-any', scope.slice(0, 30)),
      )
    : query(collection(db, 'resetRequests'), where('requesterLevel', '<', level))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      targetUsername: str(x.targetUsername),
      targetName: str(x.targetName),
      targetRoleId: str(x.targetRoleId),
      requesterLevel: Number(x.requesterLevel ?? 0),
      status: x.status === 'done' ? 'done' : 'pending',
      requestedAt: x.requestedAt,
      handledByName: (x.handledByName as string | null) ?? null,
      handledByRole: (x.handledByRole as string | null) ?? null,
      handledAt: x.handledAt,
    }
  })
}

export async function listAudit(max = 200): Promise<AuditRow[]> {
  const snap = await getDocs(query(collection(db, 'auditLog'), orderBy('at', 'desc'), limit(max)))
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      at: x.at,
      actorName: str(x.actorName),
      actorUsername: str(x.actorUsername),
      actorRole: str(x.actorRole),
      action: str(x.action),
      targetType: str(x.targetType),
      targetId: str(x.targetId),
      targetLabel: str(x.targetLabel),
      detail: (x.detail as Record<string, unknown>) ?? {},
    }
  })
}

// ---------- Perusahaan, proyek, katalog, barang proyek ----------

export interface Company {
  id: string
  name: string
  type: 'induk' | 'anak'
  active: boolean
}
export interface Project {
  id: string
  companyId: string
  name: string
  location: string
  status: 'berjalan' | 'ditunda' | 'selesai'
  startDate: string | null
  active: boolean
}
export interface CatalogItem {
  id: string
  name: string
  unit: string
  category: string
  minStock: number
  active: boolean
  projectCount: number
}
export interface ProjectItem {
  id: string
  openingQty: number | null
  openingDate: string | null
  currentStock: number | null
  minStock: number
  txCount: number
  lastTxDate: string | null
  active: boolean
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)

export async function listCompanies(): Promise<Company[]> {
  const snap = await getDocs(collection(db, 'companies'))
  return snap.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        name: str(x.name),
        type: (x.type === 'anak' ? 'anak' : 'induk') as Company['type'],
        active: x.active !== false,
      }
    })
    .sort((a, b) => Number(b.type === 'induk') - Number(a.type === 'induk') || a.name.localeCompare(b.name))
}

const toProject = (id: string, x: Record<string, unknown>): Project => ({
  id,
  companyId: str(x.companyId),
  name: str(x.name),
  location: str(x.location),
  status: x.status === 'selesai' ? 'selesai' : x.status === 'ditunda' ? 'ditunda' : 'berjalan',
  startDate: typeof x.startDate === 'string' ? x.startDate : null,
  active: x.active !== false,
})

/** Pemegang izin "projects" membaca semua; akun lain hanya proyek yang ditugaskan (per dokumen, sesuai Rules). */
export async function listProjects(seeAll: boolean, assigned: string[]): Promise<Project[]> {
  let out: Project[]
  if (seeAll) {
    const snap = await getDocs(collection(db, 'projects'))
    out = snap.docs.map((d) => toProject(d.id, d.data()))
  } else {
    const docs = await Promise.all(assigned.slice(0, 30).map((id) => getDoc(doc(db, 'projects', id))))
    out = docs.filter((d) => d.exists()).map((d) => toProject(d.id, d.data() as Record<string, unknown>))
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getProject(id: string): Promise<Project | null> {
  const d = await getDoc(doc(db, 'projects', id))
  return d.exists() ? toProject(d.id, d.data()) : null
}

export async function listCatalog(): Promise<CatalogItem[]> {
  const snap = await getDocs(collection(db, 'catalog'))
  return snap.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        name: str(x.name),
        unit: str(x.unit),
        category: str(x.category),
        minStock: Number(x.minStock ?? 0),
        active: x.active !== false,
        projectCount: Number(x.projectCount ?? 0),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function listProjectItems(projectId: string): Promise<ProjectItem[]> {
  const snap = await getDocs(collection(db, 'projects', projectId, 'items'))
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      openingQty: num(x.openingQty),
      openingDate: typeof x.openingDate === 'string' ? x.openingDate : null,
      currentStock: num(x.currentStock),
      minStock: Number(x.minStock ?? 0),
      txCount: Number(x.txCount ?? 0),
      lastTxDate: typeof x.lastTxDate === 'string' ? x.lastTxDate : null,
      active: x.active !== false,
    }
  })
}

// ---------- Buku stok (Tahap 5) ----------

/** Transaksi satu bulan. Hanya kueri kesetaraan (tanpa indeks komposit); bila itemId kosong, semua barang proyek. */
export async function listLedger(projectId: string, ym: string, itemId?: string): Promise<LedgerEntry[]> {
  const base = collection(db, 'projects', projectId, 'ledger')
  const snap = await getDocs(
    itemId
      ? query(base, where('ym', '==', ym), where('itemId', '==', itemId))
      : query(base, where('ym', '==', ym)),
  )
  return snap.docs.map((d) => {
    const x = d.data()
    const t = str(x.type)
    return {
      id: d.id,
      itemId: str(x.itemId),
      date: str(x.date),
      ym: str(x.ym),
      type: t === 'keluar' || t === 'koreksi' ? t : 'masuk',
      in: Number(x.in ?? 0),
      out: Number(x.out ?? 0),
      seq: Number(x.seq ?? 0),
      note: str(x.note),
      createdByName: str(x.createdByName),
      createdByRole: str(x.createdByRole),
      createdAt: x.createdAt,
      refEntryId: typeof x.refEntryId === 'string' ? x.refEntryId : null,
    }
  })
}

/** Total bulanan satu barang mulai bulan `fromYm` (satu dokumen per bulan), untuk saldo awal bulan tanpa membaca seluruh riwayat. */
export async function listMonths(projectId: string, itemId: string, fromYm: string): Promise<MonthTotals[]> {
  const snap = await getDocs(
    query(
      collection(db, 'projects', projectId, 'items', itemId, 'months'),
      orderBy(documentId()),
      startAt(fromYm),
    ),
  )
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      in: Number(x.in ?? 0),
      out: Number(x.out ?? 0),
      corrIn: Number(x.corrIn ?? 0),
      corrOut: Number(x.corrOut ?? 0),
      count: Number(x.count ?? 0),
    }
  })
}

/** Total harian satu barang mulai tanggal `fromDate` (YYYY-MM-DD); satu dokumen per hari yang ada transaksinya. */
export interface DayTotals {
  date: string
  in: number
  out: number
}
export async function listDays(projectId: string, itemId: string, fromDate: string): Promise<DayTotals[]> {
  const snap = await getDocs(
    query(
      collection(db, 'projects', projectId, 'items', itemId, 'days'),
      orderBy(documentId()),
      startAt(fromDate),
    ),
  )
  return snap.docs.map((d) => ({ date: d.id, in: Number(d.data().in ?? 0), out: Number(d.data().out ?? 0) }))
}

// ---------- Passkey (login biometrik) ----------

export interface MyCredential {
  id: string
  credentialId: string
  label: string
  kind: 'face' | 'fingerprint'
  createdAt: unknown
  lastUsedAt: unknown
}

export async function listMyCredentials(uid: string): Promise<MyCredential[]> {
  const snap = await getDocs(query(collection(db, 'webauthnCredentials'), where('uid', '==', uid)))
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      credentialId: str(x.credentialId),
      label: str(x.label) || 'Perangkat',
      kind: x.kind === 'face' ? 'face' : 'fingerprint',
      createdAt: x.createdAt,
      lastUsedAt: x.lastUsedAt,
    }
  })
}
