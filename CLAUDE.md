# Snip repository rules

This repository is a superproject: each app layer lives at the root of its own
orphan branch and is pinned on `main` as a submodule. Keep this file and
`.github/copilot-instructions.md` in sync.

| Path | Branch | Stack |
| --- | --- | --- |
| `backend/` | `backend` | Bun API |
| `frontend/` | `frontend` | Angular 19 |
| `cli/` | `cli` | CommonJS Node CLI |
| `bundle/` | `bundle` | Generated release output; Docker/Railway |

## Contract and commands

The shared API is `POST /api/links` (`201` link object; `400` invalid input),
`GET /api/links` (array), and `GET /:code` (`302`, increment hits; `404` if
unknown). Link fields are `code`, `url`, `shortUrl`, `hits`, `createdAt`.
Change the contract in the backend and both clients together, or not at all.
Storage is in-memory by design.

```sh
git clone --recurse-submodules https://github.com/ThatBryan/snipdemo-day1
cd backend && bun start
```

In another terminal:

```sh
cd frontend && npm install && npx ng serve
```

In a third terminal:

```sh
cd cli && node cli.js ls
```

From the superproject root:

```sh
node scripts/build-bundle.mjs
node scripts/build-bundle.mjs --push
docker build -t snip ./bundle
docker run --rm -p 3000:3000 snip
```

Commit and push a component branch first. In `main`, run
`git submodule update --remote <path>`, commit and push that gitlink change, then
rebuild the bundle. Each pointer commit pins an exact component revision.

## Do / don't

- Do not hand-edit `bundle/`; regenerate it with `scripts/build-bundle.mjs`.
- Keep `cli.js` CommonJS: do not add `"type": "module"`.
- Keep Angular's project name and output at
  `frontend/dist/snip-frontend/browser`; the bundle script depends on it.
- Keep the bundle workflow schedule/manual only. There is intentionally no push
  trigger because it exists only on `main`.
- The Docker workflow's `paths` filter watches the `bundle` gitlink on `main`,
  not files inside the submodule.
- Update this file and `.github/copilot-instructions.md` together.
