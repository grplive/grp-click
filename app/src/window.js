(async function () {
  const api = window.click
  const $ = (s) => document.querySelector(s)
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const APP_NAMES = { powerpoint: 'PowerPoint', keynote: 'Keynote' }
  const CMD_NAMES = { next: 'Next', prev: 'Back', first: 'First', last: 'Last', start: 'Start show', stop: 'End show', goto: 'Go to' }
  let snap = null

  $('#login').addEventListener('change', (e) => api.setOpenAtLogin(e.target.checked))
  $('#btn-update').addEventListener('click', () => api.openDownload())
  $('#btn-perm').addEventListener('click', () => api.openPermissions())
  $('#btn-quit').addEventListener('click', () => api.quit())

  const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  function render() {
    const st = snap.status
    const n = snap.clients.length

    // Big status: is Companion connected?
    let cls, l1, l2
    if (snap.listenError) {
      cls = 'bad'
      l1 = 'Not listening'
      l2 = snap.listenError
    } else if (n) {
      cls = 'ok'
      l1 = 'Companion connected'
      l2 = `From ${snap.clients.join(', ')}`
    } else {
      cls = 'wait'
      l1 = 'Waiting for Companion'
      l2 = 'Ready. Enter an IP address below in the GRP Click connection.'
    }
    $('#big').className = 'big ' + cls
    $('#line1').textContent = l1
    $('#line2').textContent = l2

    // Presentation: app + slide
    const slide = $('#slide')
    if (st && st.app && st.playing) {
      slide.className = 'slide'
      slide.textContent = st.end ? 'End' : st.slide ? `${st.slide} / ${st.total}` : '…'
      $('#app').textContent = `${APP_NAMES[st.app]} · slideshow running`
    } else {
      slide.className = 'slide off'
      slide.textContent = !st || !st.app ? 'PowerPoint or Keynote not open' : st.open ? 'Slideshow not started' : 'No presentation open'
      $('#app').textContent = st && st.app ? APP_NAMES[st.app] : ''
    }

    // Permission warning (Mac)
    $('#perm').classList.toggle('hidden', !snap.permission)

    // IP addresses
    $('#ips').innerHTML = snap.networks.length
      ? snap.networks.map((x) => `<div class="ip"><span class="addr">${esc(x.address)}</span><span class="net">${esc(x.label)}</span></div>`).join('')
      : '<div class="hint">Not on a network. Plug in the show network.</div>'
    $('#port-hint').textContent = `Use the address on the show network. Port ${snap.port}.`

    // Last commands
    $('#log').innerHTML = snap.recent.length
      ? snap.recent.slice(0, 5)
          .map(
            (r) =>
              `<div class="row"><span class="t">${time(r.at)}</span><span class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✓' : '✕'}</span>` +
              `<span>${esc(CMD_NAMES[r.cmd] || r.cmd)}${r.slide ? ' ' + r.slide : ''}${r.ok ? '' : ' · ' + esc(r.error)}</span>` +
              `<span class="from">${esc(r.from)}</span></div>`
          )
          .join('')
      : '<div class="hint">Nothing yet. Press a button in Companion.</div>'

    $('#update').classList.toggle('hidden', !snap.update)
    if (snap.update) $('#update-text').textContent = `GRP Click ${snap.update.latest} is available (you have ${snap.version})`
    $('#login').checked = snap.openAtLogin
    $('#foot').textContent = `GRP Click v${snap.version}`
  }

  snap = await api.getSnapshot()
  render()
  api.onSnapshot((s) => {
    snap = s
    render()
  })
})()
