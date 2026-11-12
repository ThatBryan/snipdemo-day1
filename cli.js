#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const usage = `Usage:
  snip add <url>    Create a short link
  snip ls           List links and hit counts
  snip open <code>  Open a short link in your browser
  snip help         Show this help

Set SNIP_API to change the API base URL (default: http://localhost:3000).`;

function apiBaseUrl() {
  const value = process.env.SNIP_API || 'http://localhost:3000';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('SNIP_API must be a valid http(s) URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('SNIP_API must be a valid http(s) URL.');
  }
  return url.href.replace(/\/+$/, '');
}

function validateHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Please provide a valid http(s) URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new Error('Please provide a valid http(s) URL.');
  }
  return url.href;
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...options,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error('The Snip API request timed out.');
    }
    throw new Error(`Could not reach the Snip API: ${error.message}`);
  }
  return response;
}

async function responseError(response) {
  let detail = '';
  try {
    const body = await response.json();
    if (typeof body.error === 'string') detail = `: ${body.error}`;
  } catch {
    // Error responses need not contain JSON.
  }
  if (response.status === 404) throw new Error('Short code not found.');
  throw new Error(`Snip API returned ${response.status}${detail}`);
}

async function add(url) {
  const response = await request('/api/links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: validateHttpUrl(url) }),
  });
  if (!response.ok) await responseError(response);
  const link = await response.json();
  if (!link || typeof link.shortUrl !== 'string') {
    throw new Error('Snip API returned an invalid link response.');
  }
  process.stdout.write(`${link.shortUrl}\n`);
}

async function list() {
  const response = await request('/api/links');
  if (!response.ok) await responseError(response);
  const links = await response.json();
  if (!Array.isArray(links)) throw new Error('Snip API returned an invalid links response.');
  if (links.length === 0) {
    process.stdout.write('No links yet.\n');
    return;
  }

  const rows = links.map((link) => [
    String(link.code ?? ''),
    String(link.hits ?? ''),
    String(link.url ?? ''),
  ]);
  const widths = [4, 4, 3].map((column, index) =>
    Math.max(column, ...rows.map((row) => row[index].length)),
  );
  const formatRow = (row) => `${row[0].padEnd(widths[0])}  ${row[1].padStart(widths[1])}  ${row[2]}`;
  process.stdout.write(`${formatRow(['CODE', 'HITS', 'URL'])}\n`);
  for (const row of rows) process.stdout.write(`${formatRow(row)}\n`);
}

function launchBrowser(url, options = {}) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('The API returned an unsafe redirect URL.');
  }
  const platform = options.platform || process.platform;
  const spawnProcess = options.spawnProcess || spawn;
  let command;
  let args;
  if (platform === 'win32') {
    command = 'powershell.exe';
    const script = `Start-Process -LiteralPath '${parsed.href.replace(/'/g, "''")}'`;
    args = ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [parsed.href];
  } else {
    command = 'xdg-open';
    args = [parsed.href];
  }

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(command, args, { detached: true, stdio: 'ignore' });
    } catch (error) {
      reject(new Error(`Could not launch the browser: ${error.message}`));
      return;
    }
    child.once('error', (error) => reject(new Error(`Could not launch the browser: ${error.message}`)));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function open(code, dependencies = {}) {
  const requestFn = dependencies.request || request;
  const launchBrowserFn = dependencies.launchBrowser || launchBrowser;
  const response = await requestFn(`/${encodeURIComponent(code)}`, { redirect: 'manual' });
  if (response.status === 404) throw new Error('Short code not found.');
  if (response.status !== 302) await responseError(response);
  const location = response.headers.get('location');
  if (!location) throw new Error('Snip API returned a redirect without a Location header.');
  await launchBrowserFn(new URL(location, apiBaseUrl()).href);
}

async function main(args = process.argv.slice(2)) {
  const [command, ...values] = args;
  if (!command || ['help', '--help', '-h'].includes(command)) {
    process.stdout.write(`${usage}\n`);
    return 0;
  }

  try {
    if (command === 'add' && values.length === 1) {
      await add(values[0]);
    } else if (command === 'ls' && values.length === 0) {
      await list();
    } else if (command === 'open' && values.length === 1 && values[0]) {
      await open(values[0]);
    } else {
      throw new Error(`Invalid command or arguments.\n\n${usage}`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = { launchBrowser, main, open, validateHttpUrl };
