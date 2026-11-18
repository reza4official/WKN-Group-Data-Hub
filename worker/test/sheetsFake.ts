import { readFileSync } from 'node:fs'
import vm from 'node:vm'

/** Spreadsheet dalam memori dengan permukaan API Apps Script yang dipakai Code.gs. */
class Sheet {
  rows: unknown[][] = []
  getLastRow = () => this.rows.length
  clearContents = () => {
    this.rows = []
  }
  getDataRange = () => ({ getValues: () => this.rows.map((r) => [...r]) })
  getRange = (r: number, c: number, nr: number, nc: number) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => this.rows[r - 1 + i]?.[c - 1 + j] ?? '')),
    setValues: (vals: unknown[][]) => {
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
