# Run The Numbers

A retirement projection calculator for Canadians. Plain JavaScript, built with Vite into a static site.

```
npm install
npm run dev       # local server with live reload
npm run build     # static site in dist/
npm test          # golden tests: tax and projection results must match exactly
npm run sync      # rebuild the tax figures from Airtable (needs AIRTABLE_TOKEN in .env)
npm run og-image  # redraw the link-preview picture (public/og-image.png)
```

See CLAUDE.md for how the code is laid out and the rules for changing it.

## Installing it as an app

The built site is a Progressive Web App: it can be added to the home screen and works offline after the first visit. Browsers only allow this over HTTPS (or on `localhost`), so test it from the deployed site, or with `npm run build && npm run preview` on your computer.

- **iPhone (Safari):** Share button, then **Add to Home Screen**.
- **Android (Chrome):** menu, then **Install app** (or **Add to Home screen**).
- **Desktop Chrome or Edge:** the install icon at the right of the address bar.

When a new version is published, the app downloads it in the background and uses it the next time it's opened.

## Updating the tax figures

The tax and benefit figures live in an Airtable base and are copied into `src/data/tax-data.json`, so the app never contacts Airtable.

1. Copy `.env.example` to `.env` and put your Airtable token after `AIRTABLE_TOKEN=`. `.env` is ignored by git.
2. Run `npm run sync -- --dry-run` to see what changed and what is still marked "Needs review". Nothing is written if a check fails.
3. Run `npm run sync` to write the file, then `npm test`. If figures changed, the golden tests show which results move; accept them with `npm run golden:update` only when you mean to.

## Sharing the link

`site.config.json` holds the site's public address and the footer's "Built by" name and link. Link previews on LinkedIn, Substack and elsewhere need the full address, so update `url` there once the site has its Netlify address or a custom domain, then rebuild. After publishing, paste the link into LinkedIn's [Post Inspector](https://www.linkedin.com/post-inspector/) to check the preview and refresh LinkedIn's cached copy.

## Publishing on Netlify

`netlify.toml` tells Netlify to run `npm run build` and publish `dist/`. Once the GitHub repository is connected to a Netlify site, every push to `main` rebuilds and republishes it, and each pull request gets its own preview link.

It also sets the security headers. The Content Security Policy allows nothing from outside the site (no outside scripts, fonts, images or connections), so the page has no way to send anyone's numbers elsewhere. The page, `sw.js`, `registerSW.js` and `manifest.webmanifest` are served with `Cache-Control: no-cache` so a new version is picked up on the next visit; the hashed files in `assets/` are cached for a year.

To use your own domain later, add it in Netlify under **Domain management**, follow Netlify's DNS steps, then update `url` in `site.config.json`.
