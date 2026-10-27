# Wondersoft Pharmacy (React)

1. Copy your existing `style.css` to `src/style.css`, then make these 3 edits:
   - Delete the line: `.material-symbols-outlined{font-variation-settings:...}`
   - Add: `.material-symbols-outlined{display:inline-flex;align-items:center}` (class name is kept so your icon sizing rules still work)
   - Change `url('hero-bg.jpg')` to `url('/hero-bg.jpg')`
2. Put `logo.png`, `logo2.png`, `logo.svg`, `hero-bg.jpg` in `public/`.
3. `npm install` then `npm run dev`
