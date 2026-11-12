# Snip frontend

Angular 19 client for the Snip URL shortener. It uses the shared API at
`http://localhost:3000`:

- `POST /api/links` with `{ "url": "https://…" }`
- `GET /api/links` for the link list

Run the backend separately, then start the app:

```bash
npm install
npm start
```

Open `http://localhost:4200`. To build and test:

```bash
npm run build
npm test -- --watch=false
```

The production UI is written to `dist/snip-frontend/browser`, which is consumed
by the generated bundle branch.
