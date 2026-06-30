import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { SshKey, GenerateSshKeyOptions } from '@shared/types'

const run = promisify(execFile)
const SSH_DIR = join(homedir(), '.ssh')

async function ensureSshDir(): Promise<void> {
  await fs.mkdir(SSH_DIR, { recursive: true, mode: 0o700 })
}

async function fingerprint(pubPath: string): Promise<string> {
  try {
    const { stdout } = await run('ssh-keygen', ['-lf', pubPath])
    // "256 SHA256:xxxx comment (ED25519)"
    const m = stdout.trim().match(/(SHA256:[^\s]+)/)
    return m ? m[1] : stdout.trim().split(' ')[1] || ''
  } catch {
    return ''
  }
}

export const sshService = {
  async listKeys(): Promise<SshKey[]> {
    let entries: string[]
    try {
      entries = await fs.readdir(SSH_DIR)
    } catch {
      return []
    }
    const pubFiles = entries.filter((e) => e.endsWith('.pub'))
    const keys: SshKey[] = []
    for (const pub of pubFiles) {
      const publicPath = join(SSH_DIR, pub)
      const name = pub.replace(/\.pub$/, '')
      const privatePath = join(SSH_DIR, name)
      let publicKey = ''
      try {
        publicKey = (await fs.readFile(publicPath, 'utf8')).trim()
      } catch {
        continue
      }
      const parts = publicKey.split(/\s+/)
      const type = parts[0] || ''
      const comment = parts.slice(2).join(' ')
      const fp = await fingerprint(publicPath)
      let hasPrivate = true
      try {
        await fs.access(privatePath)
      } catch {
        hasPrivate = false
      }
      keys.push({
        name,
        privatePath: hasPrivate ? privatePath : '',
        publicPath,
        publicKey,
        type,
        comment,
        fingerprint: fp
      })
    }
    return keys.sort((a, b) => a.name.localeCompare(b.name))
  },

  async generateKey(opts: GenerateSshKeyOptions): Promise<SshKey> {
    await ensureSshDir()
    const target = join(SSH_DIR, opts.fileName)
    // refuse to overwrite an existing key
    try {
      await fs.access(target)
      throw new Error(`A key named "${opts.fileName}" already exists.`)
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('A key named')) throw e
    }
    const args = ['-t', opts.type, '-f', target, '-C', opts.comment, '-N', opts.passphrase]
    if (opts.type === 'rsa') args.push('-b', '4096')
    await run('ssh-keygen', args)
    const keys = await this.listKeys()
    const created = keys.find((k) => k.name === opts.fileName)
    if (!created) throw new Error('Key generation failed.')
    return created
  },

  async deleteKey(name: string): Promise<void> {
    const priv = join(SSH_DIR, name)
    const pub = join(SSH_DIR, `${name}.pub`)
    await fs.rm(priv, { force: true })
    await fs.rm(pub, { force: true })
  }
}
