# Interactive Scheduler — Full Project

Includes:
- `src/App.jsx` (latest with phone field, image thumbnail toggle, and "להציג מחירים ביצוא")
- Tailwind + Vite setup
- GitHub Actions workflow (deploy from `dev`)

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
- If repo is `USERNAME.github.io/suka-app/` keep in `vite.config.js`:
  ```js
  base: '/suka-app/'
  ```
- If repo is `USERNAME.github.io` (root site):
  ```js
  base: '/'
  ```
Push to `dev` and the Action deploys automatically.
