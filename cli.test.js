'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { launchBrowser, open } = require('./cli');

const cliPath = path.join(__dirname, 'cli.js');
let server;
let apiBase;
let links = [];

before(async () => {
  server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/links') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const { url } = JSON.parse(raw);
      if (!url.startsWith('http')) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid URL' }));
        return;
      }
      const link = { code: 'abc123', url, shortUrl: 'http://localhost:3000/abc123', hits: 0, createdAt: new Date().toISOString() };
      links.push(link);
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify(link));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/links') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(links));
      return;
    }
    if (req.method === 'GET' && req.url === '/missing') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    if (req.method === 'GET' && req.url === '/abc123') {
      res.writeHead(302, { location: 'https://example.com/a?b=c&d=e' });
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  apiBase = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function runCli(args, api = apiBase) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: { ...process.env, SNIP_API: api },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => stdout += chunk);
    child.stderr.setEncoding('utf8').on('data', (chunk) => stderr += chunk);
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('help and no arguments print usage successfully', async () => {
  for (const args of [[], ['help']]) {
    const result = await runCli(args);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Usage:/);
    assert.equal(result.stderr, '');
  }
});

test('add validates URLs and prints created short links', async () => {
  const invalid = await runCli(['add', 'ftp://example.com']);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /valid http\(s\) URL/);

  links = [];
  const created = await runCli(['add', 'https://example.com/path']);
  assert.equal(created.code, 0);
  assert.equal(created.stdout, 'http://localhost:3000/abc123\n');
  assert.equal(created.stderr, '');
});

test('ls displays aligned links and the empty state', async () => {
  links = [];
  assert.equal((await runCli(['ls'])).stdout, 'No links yet.\n');

  links = [{ code: 'abc123', hits: 12, url: 'https://example.com/path' }];
  const result = await runCli(['ls']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /CODE\s+HITS\s+URL/);
  assert.match(result.stdout, /abc123\s+12\s+https:\/\/example\.com\/path/);
});

test('unknown codes and unreachable APIs fail with stderr and exit 1', async () => {
  const missing = await runCli(['open', 'missing']);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /Short code not found/);

  const unreachable = await runCli(['ls'], 'http://127.0.0.1:1');
  assert.equal(unreachable.code, 1);
  assert.match(unreachable.stderr, /Could not reach the Snip API/);
  assert.equal(unreachable.stdout, '');
});

test('open requests redirects manually and launches the Location target', async () => {
  let requestArgs;
  let launchedUrl;
  await open('abc123', {
    request: async (...args) => {
      requestArgs = args;
      return new Response(null, { status: 302, headers: { location: 'https://example.com/a?b=c&d=e' } });
    },
    launchBrowser: async (url) => launchedUrl = url,
  });
  assert.deepEqual(requestArgs, ['/abc123', { redirect: 'manual' }]);
  assert.equal(launchedUrl, 'https://example.com/a?b=c&d=e');
});

test('browser launch uses platform-native handlers and preserves URL characters', async () => {
  const cases = [
    { platform: 'win32', command: 'powershell.exe' },
    { platform: 'darwin', command: 'open' },
    { platform: 'linux', command: 'xdg-open' },
  ];
  for (const { platform, command } of cases) {
    let launched;
    const fakeSpawn = (actualCommand, args, options) => {
      launched = { actualCommand, args, options };
      const child = new EventEmitter();
      child.unref = () => {};
      process.nextTick(() => child.emit('spawn'));
      return child;
    };
    await launchBrowser('https://example.com/a?b=c&d=e', { platform, spawnProcess: fakeSpawn });
    assert.equal(launched.actualCommand, command);
    assert.equal(launched.options.detached, true);
    if (platform === 'win32') {
      assert.match(Buffer.from(launched.args[3], 'base64').toString('utf16le'), /https:\/\/example\.com\/a\?b=c&d=e/);
    } else {
      assert.deepEqual(launched.args, ['https://example.com/a?b=c&d=e']);
    }
  }
});
