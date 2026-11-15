// Bitfocus Companion module for GRP Click.
// Keeps one TCP connection open to the GRP Click app on each presentation machine (port 8765)
// and sends it newline-delimited JSON commands. Each reply says whether the command worked.
const { InstanceBase, InstanceStatus, runEntrypoint, combineRgb } = require('@companion-module/base')
const net = require('node:net')

const DEFAULT_PORT = 8765
const RECONNECT_MS = 5000
const MACHINE_COUNT = 10

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const AMBER = combineRgb(245, 158, 11)
const GREEN = combineRgb(0, 162, 92)
const RED = combineRgb(220, 38, 38)

const MACHINE_CHOICES = Array.from({ length: MACHINE_COUNT }, (_, i) => ({ id: i + 1, label: `Machine ${i + 1}` }))
const APP_NAME = { powerpoint: 'PowerPoint', keynote: 'Keynote' }

// "2/12" during a show; otherwise what's going on. Empty when not connected.
function slideText(show) {
	if (!show) return ''
	if (show.playing) return show.end ? 'End' : show.slide ? `${show.slide}/${show.total}` : '…'
	if (show.open) return 'Not started'
	return show.app ? 'No deck' : 'Nothing open'
}

const machineOption = { type: 'dropdown', id: 'machine', label: 'Machine', choices: MACHINE_CHOICES, default: 1 }

class ClickInstance extends InstanceBase {
	async init(config) {
		this.config = config
		this.links = new Map() // machine number -> { host, socket, connected, buffer, timer, app, version, error }
		this.setActionDefinitions(this.actions())
		this.setFeedbackDefinitions(this.feedbacks())
		this.setVariableDefinitions(this.variableDefs())
		this.setPresetDefinitions(this.presets())
		this.connectAll()
	}

	async configUpdated(config) {
		this.config = config
		this.connectAll()
	}

	async destroy() {
		this.disconnectAll()
	}

	getConfigFields() {
		const fields = [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: '',
				value:
					'Install and open GRP Click on each presentation machine. Its window shows the IP address to enter here. Leave unused machines blank.',
			},
			{
				type: 'number',
				id: 'port',
				label: 'Port (8765 unless changed)',
				width: 4,
				min: 1,
				max: 65535,
				default: DEFAULT_PORT,
			},
		]
		for (let n = 1; n <= MACHINE_COUNT; n++) {
			fields.push({ type: 'textinput', id: `machine${n}_host`, label: `Machine ${n} IP`, width: 6, default: '' })
		}
		return fields
	}

	// ---------- connections ----------

	machineHost(n) {
		return String(this.config?.[`machine${n}_host`] || '').trim()
	}

	connectAll() {
		this.disconnectAll()
		for (let n = 1; n <= MACHINE_COUNT; n++) {
			const host = this.machineHost(n)
			if (!host) continue
			this.links.set(n, {
				host,
				socket: null,
				connected: false,
				buffer: '',
				timer: null,
				platform: '',
				version: '',
				error: '',
				show: null, // last slide position from GRP Click
			})
			this.openSocket(n)
		}
		this.refresh()
	}

	disconnectAll() {
		for (const link of this.links.values()) {
			clearTimeout(link.timer)
			const socket = link.socket
			link.socket = null
			if (socket) socket.destroy()
		}
		this.links.clear()
	}

	openSocket(n) {
		const link = this.links.get(n)
		if (!link) return
		clearTimeout(link.timer)
		link.timer = null
		const socket = net.createConnection({ host: link.host, port: Number(this.config.port) || DEFAULT_PORT })
		socket.setEncoding('utf8')
		socket.setKeepAlive(true, 10000)
		link.socket = socket
		link.buffer = ''

		socket.on('connect', () => {
			link.connected = true
			socket.write(JSON.stringify({ cmd: 'ping' }) + '\n') // learn the platform and GRP Click version
			this.refresh()
		})
		socket.on('data', (data) => this.handleReplies(n, data))
		socket.on('error', (err) => {
			if (link.connected || !link.loggedError) this.log('error', `Machine ${n} (${link.host}): ${err.message}`)
			link.loggedError = true // don't repeat the same "refused" every 5 s
		})
		socket.on('close', () => {
			// Ignore closes we caused ourselves (disconnectAll or a config change replaced this link).
			if (this.links.get(n) !== link || link.socket !== socket) return
			link.socket = null
			link.connected = false
			link.show = null
			this.refresh()
			link.timer = setTimeout(() => this.openSocket(n), RECONNECT_MS)
		})
	}

	handleReplies(n, data) {
		const link = this.links.get(n)
		if (!link) return
		link.buffer += data
		let idx
		while ((idx = link.buffer.indexOf('\n')) !== -1) {
			const line = link.buffer.slice(0, idx)
			link.buffer = link.buffer.slice(idx + 1)
			let reply
			try {
				reply = JSON.parse(line)
			} catch {
				continue
			}
			link.loggedError = false
			if (reply.event === 'status') {
				link.show = reply // {app, open, playing, slide, total, end}
			} else if (reply.cmd === 'ping' && reply.ok) {
				link.platform =
					reply.platform === 'win32' ? 'Windows' : reply.platform === 'darwin' ? 'Mac' : reply.platform || ''
				link.version = reply.version || ''
			} else if (reply.ok) {
				link.error = ''
			} else {
				link.error = reply.error || 'failed'
				this.log('warn', `Machine ${n}: ${reply.cmd || 'command'} failed: ${link.error}`)
			}
		}
		this.refresh()
	}

	send(machine, cmd, extra = {}) {
		const n = Number(machine)
		const link = this.links.get(n)
		if (!link) {
			this.log('warn', `Machine ${n} has no IP set in the connection settings, "${cmd}" not sent`)
			return
		}
		if (!link.connected) {
			this.log('warn', `Machine ${n} (${link.host}) is not connected, "${cmd}" not sent`)
			return
		}
		link.socket.write(JSON.stringify({ cmd, ...extra }) + '\n')
	}

	// Instance status, variables and feedbacks after anything changes.
	refresh() {
		const configured = [...this.links.keys()]
		const connected = configured.filter((n) => this.links.get(n).connected)
		if (!configured.length) this.updateStatus(InstanceStatus.BadConfig, 'Enter at least one machine IP')
		else if (connected.length === configured.length)
			this.updateStatus(InstanceStatus.Ok, `${connected.length} of ${configured.length} machines connected`)
		else
			this.updateStatus(
				InstanceStatus.ConnectionFailure,
				`${connected.length} of ${configured.length} machines connected`,
			)

		const vars = {}
		for (let n = 1; n <= MACHINE_COUNT; n++) {
			const link = this.links.get(n)
			vars[`m${n}_status`] = !link ? 'No IP' : link.connected ? 'Connected' : 'Not connected'
			vars[`m${n}_platform`] = link?.connected ? link.platform : ''
			vars[`m${n}_version`] = link?.connected ? link.version : ''
			vars[`m${n}_error`] = link?.error || ''
			const show = link?.connected ? link.show : null
			vars[`m${n}_app`] = show ? APP_NAME[show.app] || '' : ''
			vars[`m${n}_slide`] = slideText(show)
			vars[`m${n}_slide_number`] = show?.playing && !show.end && show.slide ? show.slide : ''
			vars[`m${n}_slide_total`] = show?.playing ? show.total : ''
		}
		this.setVariableValues(vars)
		this.checkFeedbacks('offline', 'failed', 'playing')
	}

	// ---------- definitions ----------

	actions() {
		const simple = (cmd, name) => ({
			name,
			options: [machineOption],
			callback: (e) => this.send(e.options.machine, cmd),
		})
		return {
			next: simple('next', 'Next slide'),
			prev: simple('prev', 'Previous slide'),
			first: simple('first', 'First slide'),
			last: simple('last', 'Last slide'),
			start: simple('start', 'Start slideshow'),
			stop: simple('stop', 'End slideshow'),
			goto: {
				name: 'Go to slide number (Keynote, PowerPoint for Windows)',
				options: [machineOption, { type: 'number', id: 'slide', label: 'Slide number', default: 1, min: 1, max: 9999 }],
				callback: (e) => this.send(e.options.machine, 'goto', { slide: e.options.slide }),
			},
		}
	}

	feedbacks() {
		return {
			offline: {
				type: 'boolean',
				name: 'Machine not connected',
				description: 'On when the machine has an IP but GRP Click there cannot be reached',
				defaultStyle: { bgcolor: RED, color: WHITE },
				options: [machineOption],
				callback: (fb) => {
					const link = this.links.get(Number(fb.options.machine))
					return !!link && !link.connected
				},
			},
			playing: {
				type: 'boolean',
				name: 'Slideshow running',
				description: 'On while the machine is showing a slideshow',
				defaultStyle: { bgcolor: GREEN, color: WHITE },
				options: [machineOption],
				callback: (fb) => {
					const link = this.links.get(Number(fb.options.machine))
					return !!link?.connected && !!link.show?.playing
				},
			},
			failed: {
				type: 'boolean',
				name: 'Last command failed',
				description:
					'On when the last command to the machine did not work (for example no slideshow running). Clears on the next one that works.',
				defaultStyle: { bgcolor: AMBER, color: BLACK },
				options: [machineOption],
				callback: (fb) => {
					const link = this.links.get(Number(fb.options.machine))
					return !!link && link.connected && !!link.error
				},
			},
		}
	}

	variableDefs() {
		const defs = []
		for (let n = 1; n <= MACHINE_COUNT; n++) {
			defs.push(
				{ variableId: `m${n}_status`, name: `Machine ${n}: status` },
				{ variableId: `m${n}_platform`, name: `Machine ${n}: Mac or Windows` },
				{ variableId: `m${n}_version`, name: `Machine ${n}: GRP Click version` },
				{ variableId: `m${n}_error`, name: `Machine ${n}: last error` },
				{ variableId: `m${n}_slide`, name: `Machine ${n}: slide, e.g. 2/12 (or End, Not started, No deck)` },
				{ variableId: `m${n}_slide_number`, name: `Machine ${n}: slide number` },
				{ variableId: `m${n}_slide_total`, name: `Machine ${n}: number of slides` },
				{ variableId: `m${n}_app`, name: `Machine ${n}: PowerPoint or Keynote` },
			)
		}
		return defs
	}

	presets() {
		const defs = this.feedbacks()
		// Presets must spell out a boolean feedback's style: Companion 5 turns a missing one into
		// "override everything with nothing", which blanks the button whenever the feedback is on.
		const fb = (feedbackId, machine) => ({
			feedbackId,
			options: { machine },
			style: { ...defs[feedbackId].defaultStyle },
		})
		const btn = (category, name, text, actionId, options, size = '18', extra = []) => ({
			type: 'button',
			category,
			name,
			style: { text, size, color: WHITE, bgcolor: BLACK },
			steps: [{ down: actionId ? [{ actionId, options }] : [], up: [] }],
			feedbacks: [
				...extra.map((id) => fb(id, options.machine)),
				fb('failed', options.machine),
				fb('offline', options.machine),
			],
		})
		const p = {}
		for (const n of [1, 2]) {
			const c = `Machine ${n}`
			const m = { machine: n }
			p[`m${n}_next`] = btn(c, 'Next slide', 'NEXT\\n▶', 'next', m)
			p[`m${n}_prev`] = btn(c, 'Previous slide', '◀\\nBACK', 'prev', m)
			p[`m${n}_first`] = btn(c, 'First slide', 'FIRST', 'first', m)
			p[`m${n}_last`] = btn(c, 'Last slide', 'LAST', 'last', m)
			p[`m${n}_start`] = btn(c, 'Start slideshow', 'START\\nSHOW', 'start', m, '14')
			p[`m${n}_stop`] = btn(c, 'End slideshow', 'END\\nSHOW', 'stop', m, '14')
			p[`m${n}_goto`] = btn(
				c,
				'Go to slide 1 (change the number on the button)',
				'GO TO\\n1',
				'goto',
				{ ...m, slide: 1 },
				'14',
			)
			p[`m${n}_slide`] = btn(
				c,
				'Slide, e.g. 2/12 (display only, green while the show runs)',
				`$(${this.label}:m${n}_app)\\n$(${this.label}:m${n}_slide)`,
				null,
				m,
				'auto',
				['playing'],
			)
			p[`m${n}_status`] = btn(c, 'Status (display only)', `M${n}\\n$(${this.label}:m${n}_status)`, null, m, 'auto')
		}
		return p
	}
}

runEntrypoint(ClickInstance, [])
