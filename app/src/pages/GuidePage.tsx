import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/context'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Icon } from '../components/Icon'
import { Overlay } from '../components/Overlay'
import { Pill } from '../components/Pill'
import {
  buildGuide,
  inline,
  matches,
  permissionRows,
  type Ctx,
  type GuideSection,
  type GuideStep,
} from '../lib/guide'
import shots from '../lib/guideShots.json'
import { clearHint, showHint } from '../lib/guideHint'

type Shot = { route: string; caption: string; marks: { n: number; selector: string; label: string }[] }
const SHOTS = shots as unknown as Record<string, Shot>
// Gambar dibuat oleh e2e/guide-shots.mjs dari aplikasi sungguhan; belum ada = tampil tanpa gambar.
const IMAGES = import.meta.glob('../assets/panduan/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>
const imageUrl = (key: string): string | undefined => IMAGES[`../assets/panduan/${key}.png`]

const Rich = ({ text }: { text: string }) => (
  <>
    {inline(text).map((p, i) =>
      p.k === 'b' ? (
        <b key={i}>{p.t}</b>
      ) : p.k === 'code' ? (
        <code key={i}>{p.t}</code>
      ) : (
        <Fragment key={i}>{p.t}</Fragment>
      ),
    )}
  </>
)

/**
 * Panduan lengkap yang menyesuaikan diri dengan role dan izin akun saat ini. Izin dibaca ulang dari server saat halaman
 * dibuka, jadi perubahan role tercermin tanpa menunggu login ulang.
 */
export function GuidePage() {
  const { state, refreshProfile } = useAuth()
  const [q, setQ] = useState('')
  const [zoom, setZoom] = useState<string | null>(null)
  const [hintMsg, setHintMsg] = useState('')
  useEffect(() => {
    void refreshProfile().catch(() => {})
    return clearHint
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ctx: Ctx | null = useMemo(
    () =>
      state.status === 'in'
        ? {
            perms: state.perms,
            level: state.profile.level,
            projectIds: state.profile.projectIds,
            roleName: state.roleName,
          }
        : null,
    [state],
  )
  if (!ctx || state.status !== 'in') return <></>
  const view = buildGuide(ctx)
  const shown = view.available.filter((s) => matches(s, ctx, q))
  const perms = permissionRows(ctx)

  const point = async (step: GuideStep) => {
    setHintMsg('')
    if (!step.target) return
    const ok = await showHint(
      step.target,
      step.text.replace(/\*\*/g, '').replace(/`/g, '').slice(0, 140),
      step.route,
    )
    if (!ok)
      setHintMsg(
        'Elemen itu tidak ditemukan di halaman (mungkin belum ada data, atau akun Anda belum dapat melihatnya).',
      )
  }

  return (
    <>
      <Card
        title="Panduan"
        subtitle={`Untuk ${state.profile.name || state.profile.username} · role ${ctx.roleName} (level ${ctx.level}) · ${ctx.perms.has('projects') ? 'semua proyek' : `${ctx.projectIds.length} proyek`}`}
        actions={
          <div className="tools">
            <div className="search">
              <Icon name="search" />
              <input
                className="in"
                placeholder="Cari di panduan…"
                aria-label="Cari di panduan"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={() => window.print()}>
              Cetak / simpan PDF
            </Button>
          </div>
        }
      >
        <p className="sm muted" style={{ margin: 0 }}>
          Panduan ini hanya memuat yang boleh Anda lakukan, dan berubah mengikuti role serta izin akun. Tombol{' '}
          <b>Tunjukkan</b> membuka halamannya dan menandai tombol yang dimaksud. Nomor{' '}
          <span className="gnum">1</span> pada langkah sama dengan nomor pada gambar.
        </p>
        {hintMsg && (
          <div className="form-error" role="alert" style={{ marginTop: 10 }}>
            {hintMsg}
          </div>
        )}
      </Card>

      <div className="guide">
        <nav className="guide-toc" aria-label="Daftar isi panduan">
          {(['Dasar', 'Stok', 'Data', 'Administrasi', 'Bantuan'] as const).map((g) => {
            const items = shown.filter((s) => s.group === g)
            return items.length === 0 ? null : (
              <div key={g}>
                <h4>{g}</h4>
                {items.map((s) => (
                  <a
                    key={s.id}
                    href={`#panduan`}
                    onClick={(e) => (
                      e.preventDefault(),
                      document
                        .getElementById(`g-${s.id}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    )}
                  >
                    {s.title}
                  </a>
                ))}
              </div>
            )
          })}
          {view.unavailable.length > 0 && (
            <a
              href="#panduan"
              onClick={(e) => (
                e.preventDefault(),
                document.getElementById('g-tidak-tersedia')?.scrollIntoView({ behavior: 'smooth' })
              )}
            >
              Tidak tersedia untuk akun Anda
            </a>
          )}
        </nav>

        <div className="guide-body">
          <Card
            title="Izin Anda"
            subtitle="Dari role. Bagian panduan muncul atau hilang mengikuti izin ini."
            id="g-akses-tabel"
          >
            <ul className="perms">
              {perms.map((p) => (
                <li key={p.key} className={p.granted ? 'yes' : 'no'}>
                  <span aria-hidden="true">{p.granted ? '✓' : '✕'}</span>
                  <div>
                    <b>{p.label}</b>{' '}
                    <span className="sr-only">{p.granted ? '(dimiliki)' : '(tidak dimiliki)'}</span>
                    <div className="sm muted">{p.allows}</div>
                  </div>
                </li>
              ))}
            </ul>
            {ctx.level >= 90 && (
              <p className="sm muted">
                Level {ctx.level}: Anda juga dapat menghapus proyek/perusahaan secara permanen.
              </p>
            )}
          </Card>

          {shown.length === 0 && (
            <Card>
              <div className="muted">Tidak ada bagian panduan yang cocok dengan “{q}”.</div>
            </Card>
          )}
          {shown.map((s) => (
            <Section key={s.id} s={s} ctx={ctx} onPoint={point} onZoom={setZoom} />
          ))}

          {view.unavailable.length > 0 && (
            <Card
              title="Tidak tersedia untuk akun Anda"
              subtitle="Bagian ini butuh izin yang belum ada pada role Anda."
              id="g-tidak-tersedia"
            >
              <ul className="unavail">
                {view.unavailable.map((s) => (
                  <li key={s.id}>
                    <b>{s.title}</b>
                    <div className="sm muted">
                      Butuh:{' '}
                      {s.needs
                        .filter((n) => !n.ok(ctx))
                        .map((n) => n.label)
                        .join('; ')}
                    </div>
                    <div className="sm">{s.askWho}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {zoom && (
        <Overlay
          title={SHOTS[zoom]?.caption ?? 'Gambar'}
          onClose={() => setZoom(null)}
          footer={<Button onClick={() => setZoom(null)}>Tutup</Button>}
        >
          <img src={imageUrl(zoom)} alt={SHOTS[zoom]?.caption} style={{ width: '100%' }} />
        </Overlay>
      )}
    </>
  )
}

function Section({
  s,
  ctx,
  onPoint,
  onZoom,
}: {
  s: GuideSection
  ctx: Ctx
  onPoint: (st: GuideStep) => void
  onZoom: (k: string) => void
}) {
  const steps = s.steps(ctx)
  const rules = s.rules?.(ctx) ?? []
  const tips = s.tips?.(ctx) ?? []
  const warn = s.warn?.(ctx) ?? null
  return (
    <Card
      id={`g-${s.id}`}
      title={s.title}
      subtitle={s.summary}
      actions={
        s.route !== undefined ? (
          <a className="btn sm" href={`#${s.route}`}>
            Buka halaman
          </a>
        ) : undefined
      }
    >
      <div className="stack">
        {s.needs.length > 0 && (
          <div className="tools" aria-label="Akses yang dibutuhkan">
            <span className="sm muted">Akses yang dibutuhkan:</span>
            {s.needs.map((n) => (
              <Pill key={n.label} tone="ok">
                ✓ {n.label}
              </Pill>
            ))}
          </div>
        )}
        {warn && (
          <div className="form-error" role="status">
            {warn}
          </div>
        )}
        {(s.shots ?? []).map((k) => {
          const sh = SHOTS[k]
          const url = imageUrl(k)
          if (!sh) return null
          return (
            <figure className="shot" key={k}>
              {url ? (
                <button
                  type="button"
                  className="shot-img"
                  onClick={() => onZoom(k)}
                  aria-label={`Perbesar gambar: ${sh.caption}`}
                >
                  <img
                    src={url}
                    alt={`${sh.caption}. ${sh.marks.map((m) => `${m.n}: ${m.label}`).join('; ')}`}
                    loading="lazy"
                  />
                </button>
              ) : null}
              <figcaption>
                <b>{sh.caption}</b>
                <ol className="legend">
                  {sh.marks.map((m) => (
                    <li key={m.n}>
                      <span className="gnum">{m.n}</span> {m.label}
                    </li>
                  ))}
                </ol>
              </figcaption>
            </figure>
          )
        })}
        <ol className="steps">
          {steps.map((st, i) => (
            <li key={i}>
              <div className="step-text">
                {st.mark !== undefined && (
                  <span className="gnum" title={`Nomor ${st.mark} pada gambar`}>
                    {st.mark}
                  </span>
                )}{' '}
                <Rich text={st.text} />
              </div>
              {st.target && (
                <Button size="sm" onClick={() => onPoint(st)}>
                  Tunjukkan
                </Button>
              )}
            </li>
          ))}
        </ol>
        {rules.length > 0 && (
          <div>
            <h3 className="gh">Aturan penting</h3>
            <ul className="gl">
              {rules.map((r, i) => (
                <li key={i}>
                  <Rich text={r} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {tips.length > 0 && (
          <div>
            <h3 className="gh">Tips</h3>
            <ul className="gl">
              {tips.map((r, i) => (
                <li key={i}>
                  <Rich text={r} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}
