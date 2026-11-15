// GRP Click: runs on each presentation machine. Bitfocus Companion connects to it (TCP port 8765)
// and sends next / back / go to slide..., which it passes to PowerPoint or Keynote.
// Opens a window at launch, then lives in the menu bar (Mac) / system tray (Windows).
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { createDriver } = require('./src/drivers')
const { createServer } = require('./src/server')
const { listNetworks } = require('./src/networks')
const { checkForUpdate, safeDownloadUrl } = require('./src/updates')

if (!app.isPackaged && process.env.CLICK_USER_DATA) app.setPath('userData', process.env.CLICK_USER_DATA)

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

const isMac = process.platform === 'darwin'
const PORT = Number((!app.isPackaged && process.env.CLICK_PORT) || 8765)
const file = (n) => path.join(app.getPath('userData'), n)

let settings = { openAtLogin: true }
let quitting = false
let update = null // { latest, url } when a newer release is out
let server = null
let listenError = '' // e.g. the port is already taken
let tray = null
let win = null

// ---------- settings + log ----------
function loadSettings() {
  try {
    settings = { ...settings, ...JSON.parse(fs.readFileSync(file('settings.json'), 'utf8')) }
  } catch {
    // first run: open at login by default, so the machine is always ready for Companion
  }
  saveSettings()
}
function saveSettings() {
  try {
    fs.writeFileSync(file('settings.json'), JSON.stringify(settings, null, 2))
  } catch {}
}
function applyLoginItem() {
  if (!app.isPackaged) return // don't add a development copy to Login Items
  try {
    app.setLoginItemSettings({ openAtLogin: settings.openAtLogin })
  } catch {}
}

const LOG_MAX = 1024 * 1024
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`
  console.log(line)
  try {
    const p = file('click.log')
    if (fs.existsSync(p) && fs.statSync(p).size > LOG_MAX) fs.renameSync(p, p + '.old')
    fs.appendFileSync(p, line + '\n')
  } catch {}
}

// ---------- what the window and tray show ----------
const APP_NAMES = { powerpoint: 'PowerPoint', keynote: 'Keynote' }

function snapshot() {
  const info = server ? server.info() : { clients: [], status: null, recent: [] }
  return {
    version: app.getVersion(),
    platform: process.platform,
    port: PORT,
    listenError,
    clients: info.clients,
    status: info.status,
    recent: info.recent,
    permission: info.recent.length > 0 && !!info.recent[0].permission,
    networks: listNetworks(),
    update,
    openAtLogin: settings.openAtLogin,
  }
}

function showLine(st) {
  if (!st || !st.app) return 'Waiting for PowerPoint or Keynote'
  const name = APP_NAMES[st.app] || st.app
  if (st.playing) return st.end ? `${name} · end of show` : st.slide ? `${name} · slide ${st.slide} / ${st.total}` : `${name} · slideshow starting`
  if (st.open) return `${name} open · slideshow not started`
  return `${name} open · no presentation`
}

function companionLine(snap) {
  if (snap.listenError) return snap.listenError
  const n = snap.clients.length
  if (!n) return 'Waiting for Companion'
  return `Companion connected (${snap.clients.join(', ')})`
}

function changed() {
  const snap = snapshot()
  if (win && !win.isDestroyed()) win.webContents.send('snapshot', snap)
  updateTray(snap)
}

function updateTray(snap) {
  if (!tray) return
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: companionLine(snap), enabled: false },
      { label: showLine(snap.status), enabled: false },
      { type: 'separator' },
      ...(update ? [{ label: `Update available: GRP Click ${update.latest}…`, click: () => shell.openExternal(safeDownloadUrl(update.url)) }, { type: 'separator' }] : []),
      { label: 'Open GRP Click…', click: showWindow },
      { type: 'separator' },
      { label: 'Quit GRP Click', click: () => app.quit() },
    ])
  )
  tray.setToolTip(`GRP Click · ${companionLine(snap)}`)
  // Menu bar shows the slide while a show runs, e.g. "2/12".
  if (isMac) tray.setTitle(snap.status && snap.status.playing && !snap.status.end && snap.status.slide ? ` ${snap.status.slide}/${snap.status.total}` : '')
}

// ---------- window ----------
function showWindow() {
  if (win) {
    win.show()
    win.focus()
    return
  }
  win = new BrowserWindow({
    width: 460,
    height: 720,
    minHeight: 520,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#0b0b0b',
    title: 'GRP Click',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // keep it current while a full-screen show covers it
    },
  })
  win.setMenuBarVisibility(false)
  win.loadFile(path.join(__dirname, 'src/window.html'))
  win.once('ready-to-show', () => win.show())
  if (server) server.setWatching(true)
  win.on('closed', () => {
    win = null // keeps running in the menu bar / tray
    if (server) server.setWatching(false)
  })
}

const fromWindow = (e) => win && !win.isDestroyed() && e.sender === win.webContents

ipcMain.handle('get-snapshot', (e) => (fromWindow(e) ? snapshot() : null))
ipcMain.on('set-open-at-login', (e, on) => {
  if (!fromWindow(e)) return
  settings.openAtLogin = !!on
  saveSettings()
  applyLoginItem()
  changed()
})
ipcMain.on('open-permissions', (e) => {
  if (fromWindow(e) && isMac) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation')
})
ipcMain.on('open-download', (e) => fromWindow(e) && update && shell.openExternal(safeDownloadUrl(update.url)))
ipcMain.on('quit', (e) => fromWindow(e) && app.quit())

// ---------- network ----------
function startServer() {
  const driver = createDriver('auto')
  server = createServer({ driver, version: app.getVersion(), log, onChange: changed })
  server.on('error', (err) => {
    listenError =
      err.code === 'EADDRINUSE'
        ? `Port ${PORT} is already in use. Is GRP Click (or the old GRP Click Receiver) already running on this computer?`
        : `Can't listen on port ${PORT}: ${err.message}`
    log(listenError)
    changed()
    setTimeout(listen, 5000) // try again: the other copy may quit
  })
  const listen = () =>
    server.listen(PORT, '0.0.0.0', () => {
      listenError = ''
      log(`GRP Click ${app.getVersion()} ready on port ${PORT}`)
      changed()
    })
  listen()
}

// ---------- app ----------
app.on('second-instance', showWindow)

app.whenReady().then(() => {
  loadSettings()
  applyLoginItem()
  if (isMac) app.dock.hide()
  Menu.setApplicationMenu(isMac ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]) : null)

  const img = nativeImage.createFromPath(path.join(__dirname, isMac ? 'assets/trayTemplate.png' : 'assets/tray-win.png'))
  if (isMac) img.setTemplateImage(true)
  tray = new Tray(img)
  if (!isMac) tray.on('click', showWindow)

  startServer()
  showWindow()

  // Cables plugged in / Wi-Fi joined: keep the IP addresses current.
  let netKey = ''
  setInterval(() => {
    const k = JSON.stringify(listNetworks())
    if (k !== netKey) {
      netKey = k
      changed()
    }
  }, 3000)

  // Once per launch, quietly: is there a newer release? (Dev builds can point this elsewhere.)
  const testUrl = !app.isPackaged && process.env.CLICK_UPDATE_URL
  setTimeout(async () => {
    update = await checkForUpdate(app.getVersion(), testUrl || undefined)
    if (update) changed()
  }, 4000)
})

app.on('before-quit', () => {
  quitting = true
  if (server) server.shutdown()
})
app.on('window-all-closed', () => {
  if (!quitting) return // lives in the menu bar / tray
  app.quit()
})

// Development-only hook for automated screenshots. Ignored in installed builds.
if (!app.isPackaged && process.env.CLICK_DEV_HOOK) {
  app.whenReady().then(() => setTimeout(() => require(process.env.CLICK_DEV_HOOK)({ app, getWindow: () => win, getServer: () => server }), 1500))
}
