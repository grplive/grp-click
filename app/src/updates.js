// "Update available" check, the same as GRP Notes and GRP Stage Timer. Once at launch, and only
// if there's internet: asks GitHub for the latest GRP Click release and, if it's newer, the window
// shows a small notice with a Download button. Nothing is downloaded or installed by itself, and
// no error is ever shown (show networks are usually offline).
const https = require('https');
const http = require('http');

const REPO = 'grplive/grp-click';
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;

// "v1.2.10" > "v1.2.9"
function newer(a, b) {
  const p = (v) => String(v).replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

function checkForUpdate(current, url = LATEST) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    try {
      const mod = url.startsWith('http:') ? http : https;
      const req = mod.get(url, { headers: { 'User-Agent': 'GRP-Click-update-check', Accept: 'application/vnd.github+json' }, timeout: 6000 }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          body += c;
          if (body.length > 2e6) req.destroy();
        });
        res.on('end', () => {
          if (res.statusCode !== 200) return finish(null);
          try {
            const j = JSON.parse(body);
            const latest = String(j.tag_name || '').replace(/^v/i, '');
            const page = String(j.html_url || '');
            if (!latest || j.draft || j.prerelease || !newer(latest, current)) return finish(null);
            finish({ latest, url: page });
          } catch {
            finish(null);
          }
        });
      });
      req.on('timeout', () => req.destroy());
      req.on('error', () => finish(null));
    } catch {
      finish(null);
    }
  });
}

// Only ever open GRP's own download pages from the notice.
function safeDownloadUrl(u) {
  return /^https:\/\/github\.com\/grplive\/grp-click\//.test(String(u || '')) ? u : `https://github.com/${REPO}/releases/latest`;
}

module.exports = { checkForUpdate, newer, safeDownloadUrl, REPO };
