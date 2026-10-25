# Questbound

A fantasy game interface built with TypeScript, Vue 3, Vite and Nuxt UI.

## Run locally

Install **Node.js 26.12.1**. Copy `.env.example` to `.env` and replace `VITE_GAME_API_URL` with the full HTTPS game API base URL, including its API version path. The example URL is a nonfunctional placeholder. Then run:

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. Select **Start adventure** to create a game with the external game API. An internet connection is required to play.

`npm run build` creates the static site in `dist`; `npm run preview` serves that build locally. The API URL is embedded at build time and is public in the browser. Set `VITE_BASE_PATH` to a path such as `/questbound/` when hosting below the domain root; it defaults to `/`.

## Play

- Start an adventure, choose a request, and select **Solve**.
- Toggle **Safer bets**, **Helping the people**, and **Helping the state** independently. Safer bets matches the three easiest difficulty labels. Helping the people matches help, rescue, escort, advertisement, or investigation descriptions; Helping the state matches infiltration or investigation descriptions. Enabled filters combine with each other and search; switching all filters off shows every quest matching the search.
- **Continue adventure** accepts an existing game ID and loads the current list of tasks. The current ID is displayed beside the adventure controls and can be selected for copying.
- **People**, **State**, and **Underworld** reputations appear in the companion sidebar and remain unknown until you select **Investigate reputation**. Each investigation uses one turn. Counters show the last investigated values until you investigate again.
- Select **Start autoplay** to let the computer play, or **Stop autoplay** to stop it. Autoplay prioritizes healing at one life, buys each 100-gold item once, then cycles through 300-gold items in merchant order. It chooses the easiest available quests, preferring helping people, then reward and expiry when difficulty is equal.
- Open **Visit the merchant** to fetch the shop. Successful purchases appear in the satchel with quantities, including consumed potions as a record of purchases.
- The journal holds a record of the latest 50 tasks.

## Development checks

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
npm run security
```

Unit tests cover validation, game state, autoplay decisions, and component behavior. Browser tests cover complete workflows and keyboard behavior in Chromium, Firefox, WebKit, and mobile Chromium.

Install [Trivy](https://trivy.dev/latest/getting-started/installation/) on your PATH for `npm run security`. Both local checks (`npm run check`) and CI scan production and development dependencies, secrets, and applicable configuration files. CI also runs formatting, lint, type checks, coverage, production build, and browser tests.

Icons, including the dragon favicon, are from [Game Icons](https://game-icons.net/) under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), recolored to match the theme.
