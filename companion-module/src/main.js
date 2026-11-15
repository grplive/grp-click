import { InstanceBase, InstanceStatus, combineRgb } from '@companion-module/base'
import net from 'node:net'

const DEFAULT_PORT = 8765
const RECONNECT_MS = 5000
const MACHINE_COUNT = 10

const MACHINE_CHOICES = Array.from({ length: MACHINE_COUNT }, (_, i) => ({ id: i + 1, label: `Machine ${i + 1}` }))

class GrpClickInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.links = new Map() // machine number -> { socket, buffer, timer }
	}

	async init(config) {
		this.config = config
		this.updateActions()
		this.setPresetDefinitions(PRESET_STRUCTURE, buildPresets())
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
				type: 'number',
				id: 'port',
				label: 'Port (same on every receiver)',
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

	machineHost(n) {
		return (this.config?.[`machine${n}_host`] || '').trim()
	}

	connectAll() {
		this.disconnectAll()
		let configured = 0
		for (let n = 1; n <= MACHINE_COUNT; n++) {
			if (!this.machineHost(n)) continue
			configured++
			this.links.set(n, { socket: null, buffer: '', timer: null })
			this.openSocket(n)
		}
		if (!configured) this.updateStatus(InstanceStatus.BadConfig, 'Enter at least one machine IP')
		else this.updateInstanceStatus()
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
		const host = this.machineHost(n)
		const socket = net.createConnection({ host, port: Number(this.config.port) || DEFAULT_PORT })
		socket.setEncoding('utf8')
		socket.setKeepAlive(true, 10000)
		link.socket = socket
		link.buffer = ''

		socket.on('connect', () => this.updateInstanceStatus())
		socket.on('data', (data) => this.handleReplies(n, data))
		socket.on('error', (err) => {
			this.log('error', `Machine ${n} (${host}): ${err.message}`)
		})
		socket.on('close', () => {
			// Ignore closes we caused ourselves (disconnectAll or a config change replaced this link).
			if (this.links.get(n) !== link || link.socket !== socket) return
			link.socket = null
			this.updateInstanceStatus()
			link.timer = setTimeout(() => this.openSocket(n), RECONNECT_MS)
		})
	}

	// Instance status: Ok when every configured machine is connected, otherwise a count of what is missing.
	updateInstanceStatus() {
		const configured = [...this.links.keys()]
		const connected = configured.filter((n) => this.links.get(n).socket && !this.links.get(n).socket.connecting)
		if (configured.length && connected.length === configured.length) {
			this.updateStatus(InstanceStatus.Ok, `${connected.length} of ${configured.length} machines connected`)
		} else {
			this.updateStatus(InstanceStatus.ConnectionFailure, `${connected.length} of ${configured.length} machines connected`)
		}
	}

	handleReplies(n, data) {
		const link = this.links.get(n)
		if (!link) return
		link.buffer += data
		let idx
		while ((idx = link.buffer.indexOf('\n')) !== -1) {
			const line = link.buffer.slice(0, idx)
			link.buffer = link.buffer.slice(idx + 1)
			try {
				const reply = JSON.parse(line)
				if (!reply.ok) this.log('warn', `Machine ${n}: ${reply.cmd || 'command'} failed: ${reply.error}`)
			} catch {
				// ignore malformed replies
			}
		}
	}

	send(machine, cmd, extra = {}) {
		const n = Number(machine)
		const link = this.links.get(n)
		if (!link) {
			this.log('warn', `Machine ${n} has no IP set in the module settings, dropped "${cmd}"`)
			return
		}
		if (!link.socket) {
			this.log('warn', `Machine ${n} is not connected, dropped "${cmd}"`)
			return
		}
		link.socket.write(JSON.stringify({ cmd, ...extra }) + '\n')
	}

	updateActions() {
		const machineOption = {
			type: 'dropdown',
			id: 'machine',
			label: 'Machine',
			choices: MACHINE_CHOICES,
			default: 1,
		}
		const simple = (cmd, name) => ({
			name,
			options: [machineOption],
			callback: async (event) => this.send(event.options.machine, cmd),
		})

		this.setActionDefinitions({
			next: simple('next', 'Next slide'),
			prev: simple('prev', 'Previous slide'),
			first: simple('first', 'First slide'),
			last: simple('last', 'Last slide'),
			start: simple('start', 'Start slideshow'),
			stop: simple('stop', 'End slideshow'),
			goto: {
				name: 'Go to slide number',
				options: [
					machineOption,
					{ type: 'number', id: 'slide', label: 'Slide number', default: 1, min: 1, max: 9999 },
				],
				callback: async (event) => this.send(event.options.machine, 'goto', { slide: event.options.slide }),
			},
			ping: simple('ping', 'Ping receiver'),
		})
	}
}

// Presets: one button per common action, grouped under "GRP Click" in Companion.
// Each preset targets Machine 1. Change the Machine option on the button to target another machine.
const PRESET_STRUCTURE = [
	{
		id: 'grp-click-slides',
		name: 'GRP Click',
		definitions: ['next', 'prev', 'first', 'last', 'start', 'stop'],
	},
]

function buildPresets() {
	const button = (text, actionId) => ({
		type: 'simple',
		name: text,
		style: {
			text,
			size: '18',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0),
		},
		steps: [{ down: [{ actionId, options: { machine: 1 } }], up: [] }],
		feedbacks: [],
	})

	return {
		next: button('Next ▶', 'next'),
		prev: button('◀ Prev', 'prev'),
		first: button('First', 'first'),
		last: button('Last', 'last'),
		start: button('Start Show', 'start'),
		stop: button('End Show', 'stop'),
	}
}

export default GrpClickInstance
