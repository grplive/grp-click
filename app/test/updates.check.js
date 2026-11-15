// The update check: newer release found, same/older ignored, and silent when unreachable.
const assert = require('assert');
const http = require('http');
const { checkForUpdate, newer, safeDownloadUrl } = require('../src/updates');

assert(newer('0.2.10', '0.2.9') && newer('v1.0.0', '0.9.9') && !newer('0.2.3', '0.2.3') && !newer('0.2.2', '0.2.3'));
assert.strictEqual(safeDownloadUrl('https://evil.example/x'), 'https://github.com/grplive/grp-click/releases/latest');
console.log('  ✓ compares versions; only opens GRP download pages');

let tag = 'v0.9.0';
const server = http.createServer((req, res) => res.end(JSON.stringify({ tag_name: tag, html_url: 'https://github.com/grplive/grp-click/releases/tag/' + tag })));
server.listen(0, '127.0.0.1', async () => {
  const url = `http://127.0.0.1:${server.address().port}/latest`;
  const u = await checkForUpdate('0.2.3', url);
  assert.deepStrictEqual(u, { latest: '0.9.0', url: 'https://github.com/grplive/grp-click/releases/tag/v0.9.0' });
  tag = 'v0.2.3';
  assert.strictEqual(await checkForUpdate('0.2.3', url), null);
  console.log('  ✓ finds a newer release, ignores the same version');
  server.close();
  assert.strictEqual(await checkForUpdate('0.2.3', 'http://127.0.0.1:9/nothing'), null);
  console.log('  ✓ says nothing when it can’t reach GitHub');
  console.log('updates: 3 passed');
  process.exit(0);
});
