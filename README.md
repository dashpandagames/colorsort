# Color Sort website (GitHub Pages)

Files for **https://dashpandagames.github.io/** (repo `dashpandagames/dashpandagames.github.io`).

```
app-ads.txt                 → https://dashpandagames.github.io/app-ads.txt   (AdMob ad verification)
colorsort/index.html        → https://dashpandagames.github.io/colorsort/      (game website)
colorsort/play/             → https://dashpandagames.github.io/colorsort/play/ (play in the browser)
colorsort/privacy-policy/   → https://dashpandagames.github.io/colorsort/privacy-policy  (the URL in your app & Play Console)
```

## Upload
1. Open your repo `dashpandagames.github.io` on GitHub. If it doesn't exist, create a **public** repo with exactly that name.
2. **Add file → Upload files** → drag in the `colorsort` folder **and** `app-ads.txt` → **Commit changes**.
   (If an old `colorsort/` folder is there, upload over it; files with the same name are replaced.)
3. Repo **Settings → Pages**: Source = *Deploy from a branch*, Branch = `main`, folder `/ (root)` → Save.
4. Wait 1–2 minutes and open the links above.

## After it's live
- **Play Console → Store settings → Website:** `https://dashpandagames.github.io/colorsort/`
  (Play uses this domain to find `app-ads.txt`.)
- **AdMob → Apps → app-ads.txt** shows "Verified" a day or two after the app is published and linked.

## Notes
- Pure HTML/CSS/JS, no build step, no tracking, no cookies. Game progress is saved in the visitor's browser (localStorage).
- The browser game uses the same 100 campaign levels and 60 daily puzzles as the Android app (`colorsort/js/levels.js`).
- Direct links: `play/?level=5`, `play/?daily`. Keys: `Ctrl+Z` undo, `R` restart, `H` hint.
- The "Get it on Google Play" buttons go to `com.dashpandagames.colorsort`. They work once the app is published.
- Font: Fredoka (SIL Open Font License, see `colorsort/assets/fonts/OFL.txt`).
