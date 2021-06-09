const IPFS = require('ipfs-core')


;(async () => {
  const ipfs = await IPFS.create()

  try {
    // await ipfs.add('hello.world')
    const files = await ipfs.files.ls('/')

    for await (const file of files) {
      console.info(file)
    }
  } catch (error) {
    console.error(error)
  } finally {
    await ipfs.stop()
      .finally(() => {
        process.exit(0)
      })
  }
})()
