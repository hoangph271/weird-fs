const IPFS = require('ipfs-core')
const express = require('express')
// const cors = require('cors')

function createClientStat (stats) {
  return {
    ...stats,
    cid: stats.cid.toV1().toString('base64url')
  }
}

let _ipfs
// Promise.resolve().then((ipfs) => {
IPFS.create({
  repo: 'E:\\useIpfs\\.ipfs'
}).then(async ipfs => {
  _ipfs = ipfs

  const { PORT = 8081 } = process.env

  const app = express()

  // app.use(cors())

  app.post('/write/:path', async (req, res) => {
    const path = decodeURIComponent(Buffer.from(req.params.path, 'base64').toString())

    const buffers = []

    await new Promise((resolve) => {
      req.once('end', resolve).on('data', chunk => buffers.push(chunk))
    })

    await ipfs.files.touch(`/${path}`)
    await ipfs.files.write(`/${path}`, Uint8Array.from(Buffer.concat(buffers)))

    res.sendStatus(201)
  })

  app.post('/mkdir/:path', async (req, res) => {
    const path = decodeURIComponent(Buffer.from(req.params.path, 'base64').toString())

    await ipfs.files.mkdir(`/${path}`, { parents: true })

    res.sendStatus(201)
  })

  app.get('/raw/:cid', async (req, res) => {
    const cid = new IPFS.CID(req.params.cid)
    const stats = await ipfs.files.stat(cid)
    let range = req.range(stats.size)

    if (range === undefined) {
      range = [{ start: 0, end: stats.size - 1 }]
      range.type = 'bytes'
      range.isFull = true
    }

    if (range < 0) return res.sendStatus(400)
    if (range.type !== 'bytes') return res.sendStatus(400)

    const [{ start, end }] = range
    const length = end - start + 1

    res.status(range.isFull ? 200 : 206)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`)
    res.setHeader('Content-Length', length)
    res.setHeader('Content-Type', 'application/octet-stream') // TODO: Content type

    if (req.query.filename) {
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(req.query.filename ?? req.params.cid)}`)
    }

    for await (const chunk of ipfs.files.read(cid, { offset: start, length })) {
      res.write(chunk)
    }

    res.end()
  })

  app.get('/dir/:path', async (req, res) => {
    const path = decodeURIComponent(decodeURIComponent(Buffer.from(req.params.path, 'base64').toString()))

    const stats = await ipfs.files.stat(path)
    stats.path = path

    if (stats.type === 'directory') {
      stats.children = []

      for await (const child of ipfs.files.ls(path)) {
        const childStat = createClientStat(child)
        childStat.path = `${path.endsWith('/') ? path : `${path}/`}${child.name}`
        stats.children.push(childStat)
      }
    }

    res.send(createClientStat(stats))
  })

  app.delete('/:path', async (req, res) => {
    const path = decodeURIComponent(decodeURIComponent(Buffer.from(req.params.path, 'base64').toString()))

    await ipfs.files.rm(path, { recursive: true })

    res.send(200)
  })

  app.all('*', (_, res) => {
    res.sendStatus(404)
  })

  app.listen(PORT, () => {
    console.info(`http://localhost:${PORT}`)
  })

  process.once('beforeExit', async () => {
    await ipfs.stop()
  }).once('unhandledRejection', () => {
  })
}).catch(async (e) => {
  console.error(e)

  if (_ipfs) {
    await _ipfs.stop()
  }

  process.exit(0)
})
