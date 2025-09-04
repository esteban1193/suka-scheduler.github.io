# Interactive Scheduler (with persistent storage)

- Uses localStorage with a stable key and migration from older keys.
- Deploys to GitHub Pages via Actions (branch: `dev`).

## Local dev
```bash
npm i
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## GitHub Pages
Edit `vite.config.js`:
- For `https://USER.github.io/REPO_NAME/`: set `base: '/REPO_NAME/'`
- For `https://USER.github.io`: set `base: '/'`
