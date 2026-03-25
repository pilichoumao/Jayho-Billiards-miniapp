# Jayho Billiards Miniapp

A WeChat mini program prototype for billiards shot solving.

## Install

```bash
npm install
```

## Test

```bash
npm test
npm run lint
```

To run the focused regression suite:

```bash
npm test -- src/core/__tests__/regression.test.ts
```

## Mini Program Run Path

The mini program source lives under `miniprogram/`.

Open the project root in WeChat DevTools, which uses `project.config.json` and points to the `miniprogram/` directory as the app source.

Key entry files:

- `miniprogram/app.ts`
- `miniprogram/app.json`
- `miniprogram/pages/index/index.ts`

## Fixture Notes

Deterministic solver fixtures are stored in `fixtures/scenes/` and are used by the regression tests.
