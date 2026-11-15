// The networks this computer is on, with names people recognise ("Wi-Fi", "Ethernet",
// "USB 10/100/1000 LAN") rather than "en0" / "en8".
const os = require('os');
const { execFileSync } = require('child_process');

let macNames = null; // device -> hardware port name, from networksetup
function macPortNames(refresh) {
  if (macNames && !refresh) return macNames;
  macNames = {};
  try {
    const out = execFileSync('/usr/sbin/networksetup', ['-listallhardwareports'], { encoding: 'utf8', timeout: 3000 });
    let port = null;
    for (const line of out.split('\n')) {
      const p = /^Hardware Port: (.+)$/.exec(line);
      if (p) port = p[1].trim();
      const d = /^Device: (.+)$/.exec(line);
      if (d && port) macNames[d[1].trim()] = port;
    }
  } catch {}
  return macNames;
}

// [{ id: 'en0', label: 'Wi-Fi', address: '192.168.0.237' }] for every network with an IPv4 address
function listNetworks() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    const a = (list || []).find((x) => x.family === 'IPv4' && !x.internal);
    if (!a) continue;
    let label = name;
    if (process.platform === 'darwin') {
      let names = macPortNames();
      if (!(name in names)) names = macPortNames(true); // a new adapter was plugged in
      label = names[name] || name;
    }
    out.push({ id: name, label, address: a.address });
  }
  return out.sort((x, y) => x.label.localeCompare(y.label));
}

function networkLabel(id) {
  if (process.platform !== 'darwin') return id;
  return macPortNames()[id] || id;
}

module.exports = { listNetworks, networkLabel };
