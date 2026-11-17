// Kerangka Worker (Tahap 1). Hanya pemeriksaan kesehatan; logika API ditambahkan di Tahap 2.
const VERSION = '0.1.0'

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, service: 'wkn-data-hub-api', version: VERSION })
    }
    return Response.json({ ok: false, error: 'Tidak ditemukan' }, { status: 404 })
  },
}
