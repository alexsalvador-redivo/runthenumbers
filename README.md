# Run The Numbers

A retirement projection calculator for Canadians. Plain JavaScript, built with Vite into a static site.

```
npm install
npm run dev       # local server with live reload
npm run build     # static site in dist/
npm test          # golden tests: tax and projection results must match exactly
```

See CLAUDE.md for how the code is laid out and the rules for changing it.

## Installing it as an app

The built site is a Progressive Web App: it can be added to the home screen and works offline after the first visit. Browsers only allow this over HTTPS (or on `localhost`), so test it from the deployed site, or with `npm run build && npm run preview` on your computer.

- **iPhone (Safari):** Share button, then **Add to Home Screen**.
- **Android (Chrome):** menu, then **Install app** (or **Add to Home screen**).
- **Desktop Chrome or Edge:** the install icon at the right of the address bar.

When a new version is published, the app downloads it in the background and uses it the next time it's opened.
