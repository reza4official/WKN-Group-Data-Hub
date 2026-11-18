import { readFileSync } from 'node:fs'
import vm from 'node:vm'

/** Spreadsheet dalam memori dengan permukaan API Apps Script yang dipakai Code.gs. */
class Sheet {
  rows: unknown[][] = []
  formats: string[][] = []
  getLastRow = () => this.rows.length
  clearContents = () => {
    this.rows = []
    this.formats = []
  }
  getDataRange = () => ({ getValues: () => this.rows.map((r) => [...r]) })
  getRange = (r: number, c: number, nr: number, nc: number) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => this.rows[r - 1 + i]?.[c - 1 + j] ?? '')),
    setNumberFormats: (f: string[][]) => {
      f.forEach((row, i) => {
        const t = (this.formats[r - 1 + i] ??= [])
        row.forEach((x, j) => (t[c - 1 + j] = x))
      })
    },
    setValues: (vals: unknown[][]) => {
      // Meniru Google Sheets: sel TANPA format teks (@) menafsirkan ulang string yang tampak seperti angka atau tanggal.
      vals = vals.map((row, i) =>
        row.map((v, j) => {
          if (typeof v !== 'string' || this.formats[r - 1 + i]?.[c - 1 + j] === '@') return v
          if (/^\d+(\.\d+)?$/.test(v)) return Number(v)
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00Z`)
          return v
        }),
      )
      vals.forEach((row, i) => {
        const t = (this.rows[r - 1 + i] ??= [])
        row.forEach((v, j) => (t[c - 1 + j] = v))
      })
    },
  })
}
export class Spreadsheet {
  sheets = new Map<string, Sheet>()
  getSheetByName = (n: string) => this.sheets.get(n) ?? null
  insertSheet = (n: string) => {
    const s = new Sheet()
    this.sheets.set(n, s)
    return s
  }
  data = (n: string) => this.sheets.get(n)?.rows ?? []
}

/** Menjalankan Code.gs ASLI di vm dengan layanan Google yang di-stub. */
export function loadAppsScript(props: Record<string, string>) {
  const ss = new Spreadsheet()
  let locks = 0
  const sandbox: Record<string, unknown> = {
    SpreadsheetApp: { openById: (id: string) => (id === props.SHEET_ID ? ss : (() => { throw new Error('Sheet tidak ditemukan') })()) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    LockService: { getScriptLock: () => ({ waitLock: () => void locks++, releaseLock: () => void locks-- }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ text: t, setMimeType() { return this } }) },
  }
  vm.createContext(sandbox)
  vm.runInContext(readFileSync(new URL('../../apps-script/Code.gs', import.meta.url), 'utf8'), sandbox)
  const call = (name: string, ...args: unknown[]) => (sandbox[name] as (...a: unknown[]) => unknown)(...args)
  return {
    ss,
    call,
    heldLocks: () => locks,
    post: (body: string) => JSON.parse((call('doPost', { postData: { contents: body } }) as { text: string }).text) as { ok: boolean; error?: string; counts?: Record<string, number> },
    get: () => JSON.parse((call('doGet') as { text: string }).text),
  }
}
