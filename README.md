# Snip CLI

A zero-dependency Node.js command-line client for the Snip URL shortener. Node.js 20 or newer is required.

```sh
node cli.js add https://example.com
node cli.js ls
node cli.js open <code>
```

Set `SNIP_API` to change the API base URL; it defaults to `http://localhost:3000`. The `snip`, `snip.cmd`, and `snip.ps1` wrappers launch the CLI on macOS/Linux, Windows Command Prompt, and PowerShell respectively. The `snip` executable is also available through the package's `bin` entry.

The CLI uses `POST /api/links` to create links, `GET /api/links` to list them, and `GET /:code` to open a link in the system browser.
