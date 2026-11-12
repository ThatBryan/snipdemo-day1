# Snip

Snip is a tiny URL shortener with one API and two clients: an Angular web app and
a Node CLI. Each component has its own orphan branch and is mounted on `main` as
a submodule pinned to an exact commit.

## Layout

| Path | Branch | Contents |
| --- | --- | --- |
| `backend/` | `backend` | Bun API server |
| `frontend/` | `frontend` | Angular 19 web app |
| `cli/` | `cli` | Zero-dependency CommonJS CLI |
| `bundle/` | `bundle` | Generated API, web UI, and CLI release |

Clone with submodules initialized:

```sh
git clone --recurse-submodules https://github.com/ThatBryan/snipdemo-day1
cd snipdemo-day1
```

A plain clone leaves the component folders empty until you run
`git submodule update --init --recursive`.

## API contract

The backend listens on port 3000 by default. Links are stored in memory and are
cleared when the server restarts.

| Method | Path | Result |
| --- | --- | --- |
| `POST` | `/api/links` | JSON `{ "url": "https://…" }` returns `201` and `{ code, url, shortUrl, hits, createdAt }`; invalid JSON or non-HTTP(S) URL returns `400` with `{ error }`. |
| `GET` | `/api/links` | `200` and an array of link objects with the same fields. |
| `GET` | `/:code` | `302` to the original URL and increments `hits`; `404` for an unknown code. |

The API enables CORS for browser clients. `BASE_URL` controls generated short
links; if unset, the server uses `https://$RAILWAY_PUBLIC_DOMAIN` when available,
otherwise localhost.

## Run locally

Use three terminals from the `main` checkout:

```sh
cd backend
bun start
```

```sh
cd frontend
npm install
npx ng serve
```

```sh
cd cli
node cli.js ls
```

The API is at `http://localhost:3000`; Angular is at `http://localhost:4200`.
Set `SNIP_API` to override the CLI's default API URL.

## Update workflow

Edit a component in its branch checkout, then commit and push that component
branch. In the superproject, update and commit its pinned submodule pointer:

```sh
git submodule update --remote backend
git add backend
git commit -m "Update backend submodule"
git push
```

Repeat with `frontend` or `cli` as appropriate. Rebuild the generated release
with `node scripts/build-bundle.mjs`; pass `--push` to push the `main` update as
well as the generated `bundle` branch.

## Generated release and CI

`bundle/` is generated output; do not edit its server, CLI, or built UI by hand.
The build script updates the three source submodules, builds Angular to
`dist/snip-frontend/browser`, assembles the Docker/Railway release, commits the
bundle output if it changed, and advances the `main` gitlinks. It is safe to run
again when nothing changed.

```sh
node scripts/build-bundle.mjs
node scripts/build-bundle.mjs --push
docker build -t snip ./bundle
docker run --rm -p 3000:3000 snip
```

GitHub Actions rebuilds the bundle hourly or on manual dispatch. Docker images
are published to GHCR when `main` pins a new bundle revision, or on manual
dispatch.
