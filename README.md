# Snip backend

A zero-dependency Bun URL shortener API. Links are stored in memory and are cleared when the server restarts.

## Run

```sh
bun start
```

The server listens on port `3000` by default. Set `PORT` to change it, `BASE_URL` to set the origin used in returned short URLs, or `RAILWAY_PUBLIC_DOMAIN` to use `https://<domain>` when `BASE_URL` is unset. `BASE_URL` takes precedence. Set `PUBLIC_DIR` to also serve static files from a directory; `/` serves its `index.html`, and existing files take precedence over matching short codes.

## API

| Method | Path | Result |
| --- | --- | --- |
| `POST` | `/api/links` | `201` link object; `400` for invalid JSON or a non-HTTP(S) URL |
| `GET` | `/api/links` | `200` array of link objects |
| `GET` | `/:code` | `302` redirect and increments hits; `404` for an unknown code |

Link objects contain `code`, `url`, `shortUrl`, `hits`, and `createdAt`.
