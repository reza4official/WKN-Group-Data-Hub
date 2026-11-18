import { createServer } from 'node:http'
import { generateKeyPairSync } from 'node:crypto'
import worker from '../worker/src/index'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const env = {
  FIREBASE_PROJECT_ID: 'demo-wkn',
  USE_EMULATOR: 'true',
  ALLOWED_ORIGINS: 'http://127.0.0.1:4173,http://localhost:4173',
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'wkn-worker@demo-wkn.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
}
createServer(async (req, res) => {
  const url = `http://127.0.0.1:8787${req.url}`
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const body = chunks.length && req.method !== 'GET' ? Buffer.concat(chunks) : undefined
  const r = await worker.fetch(new Request(url, { method: req.method, headers, body }), env as never)
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()))
}).listen(8787, '127.0.0.1', () => console.log('worker dev on 8787'))
