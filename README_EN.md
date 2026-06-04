# MuseAI Mini Program Frontend

中文版本: [README.md](./README.md)

MuseAI frontend is a native WeChat mini-program for the Banpo Museum AI guide experience. It focuses on personalized onboarding, fixed hall selection, SSE streaming AI guide chat, text-based exhibit search, exhibit detail discussion, and post-visit reports.

Current product stage: Stage 10C. The mini-program is the primary delivery target. The frontend should stay aligned with backend contracts and should not expose unfinished camera/OCR/voice features as if they were ready.

## Current Status

Implemented and active:

- Home entry for personalized guide and default visitor guide.
- Three-step onboarding questionnaire.
- Four guide identities:
  - Archaeology Researcher, backend persona `A`
  - Study Tour Recorder, backend persona `B`
  - History Inquirer, backend persona `C`
  - Artifact Researcher, backend persona `D`
- Persona reveal page with route/hall/report expectations.
- Fixed Banpo hall route display.
- Hall selection page with fixed order and no AI-recommended-first labels.
- Tour chat page with SSE streaming responses.
- Markdown rendering for AI answers, including soft line wrapping and copyable text.
- Suggestion bar for hall-mode and object/exhibit-mode discussions.
- Text-based exhibit search.
- Exhibit detail page and "discuss with AI" flow.
- Visit report page with safer local fallback and non-blocking event upload.
- Session persistence rules:
  - "Continue last tour" appears only after enough real AI interactions.
  - stale or incompatible session cache is cleaned.
- Frontend tests for markdown, suggestions, and report statistics.

Not complete yet:

- Camera-based exhibit search.
- OCR/image recognition backend integration.
- Voice input.
- End-to-end TTS playback.
- Official indoor map and location navigation.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Native WeChat mini-program |
| UI | WeChat WXML/WXSS + TDesign Mini Program |
| State | CommonJS stores under `store/` |
| Network | `wx.request` wrapper in `utils/request.js` |
| Streaming | `wx.request` with `enableChunked` in `api/stream.js` |
| Local storage | `utils/storage.js` |
| Tests | Node scripts under `scripts/` |

## Directory Layout

```text
frontend/
├── app.js
├── app.json
├── app.wxss
├── api/
│   ├── index.js                  # REST API wrappers
│   └── stream.js                 # SSE parser over wx.request enableChunked
├── components/
│   ├── chat/message-bubble/      # AI/user message rendering
│   ├── common/section-card/
│   ├── exhibit/exhibit-card/
│   └── persona/persona-card/
├── constants/
│   ├── banpo-halls.js            # Hall slugs, names, order, aliases
│   └── index.js                  # Shared UI/constants
├── pages/
│   ├── home/                     # Entry page
│   ├── onboarding/               # Questionnaire
│   ├── persona-reveal/           # Identity result
│   ├── route/                    # Fixed visit route
│   ├── hall/                     # Hall selection
│   ├── tour/                     # Streaming AI guide chat
│   ├── exhibit-scan/             # Text exhibit search
│   ├── exhibit-detail/           # Object/exhibit detail + AI discussion
│   └── report/                   # Visit report
├── scripts/
│   ├── test-guide-suggestions.js
│   ├── test-markdown.js
│   └── test-report-stats.js
├── store/
│   ├── auth.js
│   ├── chat.js
│   └── tour.js
├── utils/
│   ├── markdown.js
│   ├── request.js
│   ├── storage.js
│   └── util.js
├── _web_archive/                 # Archived Vue web frontend, not part of mini-program build
├── package.json
├── project.config.json
└── sitemap.json
```

## Pages and Flow

### Home

`pages/home/home`

- Starts personalized guide.
- Starts default guide.
- Shows "continue last tour" only after at least five AI interactions in the same session.
- Creates tour sessions through backend `/tour/sessions`.

### Onboarding

`pages/onboarding/onboarding`

The questionnaire has three steps, each with four choices:

1. Main intent: task recording, evidence/history, historical questions, artifact details.
2. Initial interpretation angle.
3. Preferred guide rhythm.

The result is stored in `tourStore` and later injected into `buildStyledPrompt()` so the AI answer style changes with the user's chosen identity and intent.

### Persona Reveal

`pages/persona-reveal/persona-reveal`

Shows the resolved guide identity and summarizes how route, questions, and reports will be organized. The primary action enters the route page.

### Route

`pages/route/route`

Current product decision: route is a fixed Banpo visit route, not an AI ranking UI. The page no longer consumes stale `visitedHalls`, `currentHall`, or old `pendingEvents` to mark "visited" or "recommended first".

Temporary exhibition halls are listed last because their content is not yet stable.

### Hall Selection

`pages/hall/hall`

Shows fixed hall order from `constants/banpo-halls.js`. It no longer displays "AI recommended first" badges or route summary cards.

When a hall is selected, the page records a real `hall_enter` event. Reports should count visited halls from these real hall events, not from ordinary chat context.

### Tour Chat

`pages/tour/tour`

- Calls `/tour/sessions/{id}/chat/stream`.
- Receives SSE chunks through `api/stream.js`.
- Renders markdown incrementally.
- Supports stopping generation.
- Suggestion bar adapts to hall-mode or object/exhibit-mode.
- "Report" navigation is not blocked by slow event upload.

### Exhibit Search

`pages/exhibit-scan/exhibit-scan`

Current behavior is text search only. The UI should not imply camera recognition is available.

The page immediately shows local fallback data by hall, then asynchronously merges backend results from `/exhibits`. API timeout and retry behavior are intentionally conservative so the page does not stay stuck in loading.

### Exhibit Detail

`pages/exhibit-detail/exhibit-detail`

Supports discussion with AI about the selected object. The copy and suggestions intentionally use neutral terms like "object" or "discussion target" because some records may be spaces, remains, reconstructed contexts, or reference items rather than movable exhibits.

### Report

`pages/report/report`

Generates or fetches backend reports and merges local pending events for UI fallback. Hall visit statistics should come from backend `halls_visited` or real `hall_enter`/`hall_leave` events.

## API Configuration

Current development files still use a direct backend address:

- `utils/request.js`
- `api/stream.js`
- `api/index.js` health root

Before production upload, replace the API host with the HTTPS domain configured in WeChat:

```js
const BASE_URL = 'https://api.example.com/api/v1'
```

Health root in `api/index.js` should also use the same HTTPS server root:

```js
const SERVER_ROOT = 'https://api.example.com'
```

Do not ship the production mini-program with:

- raw IP address
- `http://`
- non-standard exposed port
- WeChat "do not verify domain" development setting

## Local Development

1. Install WeChat DevTools.
2. Open the `frontend/` directory as the mini-program project.
3. Ensure `project.config.json` contains the intended AppID.
4. Install dependencies:

```bash
cd frontend
npm install
```

5. In WeChat DevTools, run "Tools -> Build npm".
6. For local development only, you may enable "do not verify legal domain, web-view domain, TLS version and HTTPS certificate".
7. Compile and preview.

## Tests

Run all frontend tests:

```bash
cd frontend
npm.cmd run test:all
```

Individual checks:

```bash
npm.cmd run test:markdown
npm.cmd run test:suggestions
npm.cmd run test:report
```

Syntax checks:

```bash
node --check api/index.js
node --check api/stream.js
node --check utils/request.js
node --check utils/storage.js
node --check utils/markdown.js
node --check constants/banpo-halls.js
node --check store/tour.js
node --check pages/home/home.js
node --check pages/onboarding/onboarding.js
node --check pages/persona-reveal/persona-reveal.js
node --check pages/route/route.js
node --check pages/hall/hall.js
node --check pages/tour/tour.js
node --check pages/exhibit-scan/exhibit-scan.js
node --check pages/exhibit-detail/exhibit-detail.js
node --check pages/report/report.js
```

Recent expected output:

```text
markdown parser checks passed
guide suggestion checks passed: 96 hall/persona combinations
report stat checks passed
```

## WeChat Release Checklist

Before upload:

- Backend is available through HTTPS domain.
- WeChat request legal domain is configured.
- `utils/request.js`, `api/stream.js`, and `api/index.js` no longer point to raw IP/HTTP development address.
- Domain verification is enabled in DevTools testing.
- Camera/OCR/voice entries are hidden or clearly unavailable unless fully implemented.
- `npm.cmd run test:all` passes.
- Core real-device scenarios pass:
  - personalized onboarding
  - default visitor entry
  - route page
  - hall selection
  - guide chat
  - suggestion click
  - text exhibit search
  - exhibit detail discussion
  - report generation

Upload flow:

1. WeChat DevTools -> Build npm.
2. Compile and real-device preview.
3. Upload code.
4. WeChat public platform -> Version management -> Submit for review.
5. After approval, publish.

## Operational Rules

- Keep frontend contracts aligned with backend schema and hall slugs.
- Do not commit `node_modules/` or `miniprogram_npm/`.
- Do not expose unfinished camera/OCR/voice features as available features.
- When API base URL or route structure changes, update:
  - `frontend/README.md`
  - root `前端配置文档.md`
  - `FRONTEND_CHANGE_SUMMARY.md`
- When backend contracts change, update API wrappers and tests in the same commit whenever possible.
