'use strict'
// Internal restart helper. Commands and ports are constants, never user input.
const fs = require('fs')
const net = require('net')
const path = require('path')
const { spawn } = require('child_process')

const root = path.resolve(__dirname, '..')
const runtimeDir = path.join(root, 'runtime')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function portInUse() {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 8484 })
    let finished = false
    const done = occupied => {
      if (finished) return
      finished = true
      socket.destroy()
      resolve(occupied)
    }
    socket.setTimeout(450)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(true))
    socket.once('error', () => done(false))
  })
}

function logError(error) {
  try {
    fs.mkdirSync(runtimeDir, { recursive: true })
    fs.appendFileSync(path.join(runtimeDir, 'portal.restart.err.log'),
      '[' + new Date().toISOString() + '] ' + (error.stack || error) + '\n')
  } catch { /* logging unavailable */ }
}

async function main() {
  fs.mkdirSync(runtimeDir, { recursive: true })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline && await portInUse()) await sleep(350)
  if (await portInUse()) throw new Error('8484 端口尚未释放，重启已取消，未结束任何其他进程')

  const out = fs.openSync(path.join(runtimeDir, 'portal.restart.out.log'), 'a')
  const err = fs.openSync(path.join(runtimeDir, 'portal.restart.err.log'), 'a')
  try {
    const win = process.platform === 'win32'
    const command = win ? (process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe') : 'npm'
    const args = win ? ['/d', '/s', '/c', 'npm.cmd', 'run', 'portal'] : ['run', 'portal']
    const child = spawn(command, args, {
      cwd: root,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', out, err],
      env: { ...process.env, BROWSER: 'none' }
    })
    child.once('error', logError)
    child.unref()
  } finally {
    fs.closeSync(out)
    fs.closeSync(err)
  }
}

main().catch(error => {
  logError(error)
  process.exitCode = 1
})
