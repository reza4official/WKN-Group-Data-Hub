import { useState } from 'react'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Overlay } from '../components/Overlay'
import { PasswordInput } from '../components/PasswordInput'
import { Pill } from '../components/Pill'
import { ScrollTable } from '../components/ScrollTable'
import { useToast } from '../components/Toast'

/** Galeri komponen untuk pengembangan. Hanya dimuat saat `vite dev`, tidak ikut build produksi. */
export default function Gallery() {
  const { toast } = useToast()
  const [modal, setModal] = useState(false)
  const [drawer, setDrawer] = useState(false)
  return (
    <>
      <Card title="Tombol dan status" subtitle="Komponen dasar">
        <div className="stack">
          <div className="row">
            <Button>Biasa</Button>
            <Button variant="primary">Utama</Button>
            <Button variant="danger">Hapus</Button>
            <Button size="sm">Kecil</Button>
            <Button disabled>Nonaktif</Button>
          </div>
          <div className="row">
            <Pill tone="ok">Aman</Pill>
            <Pill tone="warn">Menipis</Pill>
            <Pill tone="bad">Kritis</Pill>
            <Pill tone="mute">Tidak bergerak</Pill>
            <Pill tone="blue">Manajer Proyek</Pill>
          </div>
          <div className="row">
            <Button onClick={() => setModal(true)}>Buka modal</Button>
            <Button onClick={() => setDrawer(true)}>Buka panel</Button>
            <Button onClick={() => toast('Tersimpan atas nama Anda')}>Tampilkan toast</Button>
          </div>
        </div>
      </Card>
      <Card title="Formulir">
        <div className="grid2">
          <div className="field">
            <label htmlFor="g-nama">Nama</label>
            <input id="g-nama" className="in" placeholder="Nama lengkap" />
          </div>
          <PasswordInput label="Password" placeholder="Minimal 6 karakter" />
        </div>
      </Card>
      <Card title="Tabel dengan penanda geser" flush>
        <ScrollTable label="Contoh tabel">
          <table>
            <thead>
              <tr>
                <th>Barang</th>
                <th>Satuan</th>
                <th className="r">Masuk</th>
                <th className="r">Keluar</th>
                <th className="r">Sisa</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Contoh barang</td>
                <td>Sak 50 kg</td>
                <td className="r num">100</td>
                <td className="r num">40</td>
                <td className="r num">60</td>
                <td className="wrap">Baris contoh untuk memeriksa tampilan</td>
              </tr>
            </tbody>
          </table>
        </ScrollTable>
      </Card>
      <Card flush>
        <EmptyState icon="box" title="Keadaan kosong">
          Teks penjelasan untuk halaman yang belum berisi data.
        </EmptyState>
      </Card>
      {modal && (
        <Overlay
          title="Contoh modal"
          onClose={() => setModal(false)}
          footer={
            <Button variant="primary" onClick={() => setModal(false)}>
              Simpan
            </Button>
          }
        >
          <p style={{ margin: 0 }}>Escape atau klik di luar menutup modal. Fokus kembali ke tombol pemicu.</p>
        </Overlay>
      )}
      {drawer && (
        <Overlay variant="drawer" title="Contoh panel" onClose={() => setDrawer(false)}>
          <p style={{ margin: 0 }}>Panel samping untuk detail.</p>
        </Overlay>
      )}
    </>
  )
}
