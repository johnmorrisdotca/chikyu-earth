# Contributing

Chikyu Earth is a small TypeScript package: a line-drawn globe, a web component, and the data baked in.
These are the rules and the commands.

## Set up

```sh
pnpm install
pnpm check        # lint, typecheck, unit tests, build, package check
```

Work in a git worktree from `origin/main`, one branch per change. Ports: this package owns **8200–8299**
(8200 the demo, 8201 the tests); check a port is free before you use it, and stop only your own processes by PID.

## The rules

- **Draw from public facts, and cite them.** The outlines are Natural Earth's (public domain); names and codes
  are kuni's. Never copy or trace a map's artwork, a flag, an emblem or any official mark. No SPX, SPXN or SPXIS
  marks in this MIT package.
- **Bake data at build time.** Nothing is fetched at runtime. Change the data through `scripts/make-countries.ts`
  (`pnpm countries`), never by editing `src/data/countries.ts` by hand, and say what a change adds in bytes.
- **Keep it small.** d3-geo and kazoku-ui are the runtime dependencies; do not add another without saying so.
  `globe()` and the rotation helpers stay pure: the same arguments give the same markup.
- **Two looks, one geometry.** A style changes lines and fills, never the shape. Add a look in `src/styles.ts`.
- **A fact with no source is left out, never guessed.**

## Checks

Run these before every push, all green:

```sh
pnpm check        # lint, typecheck, unit tests, build, package check
pnpm test:demo    # the demo in a real browser (needs: pnpm exec playwright install chromium)
```

The demo runs at `pnpm dev` → http://127.0.0.1:8200/chikyu-earth/. If you change what a person sees, look at it:
render it, screenshot it, compare it with the line style of Hako Devices and Uchusen Rockets, and fix what is off.

## Release

Do not tag and do not publish. A release is prepared by bumping `package.json`, moving the CHANGELOG's unreleased
notes under the new version, and pushing; the coordinating session tags when CI is green and the Release workflow
publishes to npm by trusted publishing. Ask first before a new package name, a first publish, a major version, a
deprecation or a licence change.
