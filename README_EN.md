# MuseAI WeChat Mini-Program Frontend

Chinese version: [README.md](./README.md)

MuseAI frontend is a native WeChat mini-program for the Banpo Museum guide experience. The current delivery goal is to complete the real-device closed loop from onboarding to persona, route, hall guide chat, exhibit recognition/search, TTS playback, and visit report before formal release.

## Current Stage

The frontend is currently in **Stage 13: pre-launch closed-loop validation and release preparation**.

The code-level MVP covers the main product flow, but formal release is not complete. Current blockers include:

- The mini-program filing subject has not been finalized.
- `api.banpo-museai.xyz` has DNS/SSL/Nginx configured, but it may not work reliably as a WeChat legal request domain before filing is accepted.
- Development and real-device debugging may still use `http://122.152.232.190:3000/api/v1`.
- OCR, TTS, keyboard adaptation, and report statistics still require multi-device real-device testing.

## Implemented Capabilities

- Home entry for personalized guide, default visitor guide, and continue-last-tour.
- Continue-last-tour is only shown after enough real AI interaction has happened.
- Three-step onboarding: focus, initial assumption, and guide mode.
- Four guide identities:
  - Archaeology Researcher, backend persona `A`
  - Study Tour Recorder, backend persona `B`
  - History Inquirer, backend persona `C`
  - Artifact Researcher, backend persona `D`
- Persona reveal page with guide perspective and route entry.
- AI curator route page using backend `/curator/plan-tour`, with safe fallback behavior.
- Hall selection page with always-open halls first and temporary halls near the end.
- Tour page:
  - SSE streaming AI answers
  - suggestion bar
  - Markdown rendering
  - copyable plain text AI answers
  - manual TTS playback
- Exhibit recognition/search:
  - text exhibit search
  - camera/OCR MVP
  - fallback to text search when OCR is unavailable
  - matched result can open exhibit detail
- Exhibit detail page with follow-up AI discussion.
- Visit report page:
  - visited halls
  - reflection
  - record summary
  - basic stats
- Mobile adaptation:
  - safe-area handling
  - keyboard raise handling for the bottom input bar
  - basic compatibility across screen sizes

## Not Complete Or Still Needs Retesting

- Formal mini-program filing, experience-version upload, and tester distribution.
- WeChat legal domains for request/uploadFile/downloadFile.
- OCR service ID and real-device camera recognition stability.
- TTS voice quality, speed, generation latency, and real-device playback stability.
- iOS keyboard height, notch screens, large-font mode, and Android resolution matrix.
- Official museum exhibit images, map, positions, and complete hall data.
- Privacy policy, user agreement, and camera/voice permission notices.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Native WeChat mini-program |
| UI | WXML / WXSS / TDesign Mini Program |
| State | CommonJS stores |
| REST requests | `utils/request.js` |
| Streaming | `api/stream.js` with `wx.request enableChunked` |
| Local storage | `utils/storage.js` |
| Markdown | `utils/markdown.js` |
| Tests | Node scripts |

## Directory Layout

```text
frontend/
├── app.js / app.json / app.wxss
├── api/
│   ├── index.js          # REST wrappers, TTS, OCR, exhibits, routes
│   └── stream.js         # SSE/chunked response parser
├── components/
│   ├── chat/
│   ├── common/
│   ├── exhibit/
│   └── persona/
├── constants/
│   └── banpo-halls.js    # Hall slugs, names, order, aliases
├── pages/
│   ├── home/
│   ├── onboarding/
│   ├── persona-reveal/
│   ├── route/
│   ├── hall/
│   ├── tour/
│   ├── exhibit-scan/
│   ├── exhibit-detail/
│   └── report/
├── store/
│   ├── tour.js
│   └── chat.js
├── utils/
└── scripts/
```

## Local Development

```bash
cd frontend
npm install
```

Open `frontend/` with WeChat DevTools.

## API Endpoint Configuration

Mini-program request endpoints are currently configured across three files. Check all of them when switching environments:

| File | Purpose |
| --- | --- |
| `utils/request.js` | normal REST requests |
| `api/stream.js` | SSE guide streaming requests |
| `api/index.js` | direct API wrappers for TTS, OCR, exhibits, and routes |

Development/debug endpoint:

```text
http://122.152.232.190:3000/api/v1
```

Formal release endpoint:

```text
https://api.banpo-museai.xyz/api/v1
```

The formal endpoint is only release-ready when:

- domain filing is accepted;
- the HTTPS certificate is valid;
- WeChat legal domains are configured for request/uploadFile/downloadFile;
- WeChat DevTools works after disabling "ignore legal domain, web-view, TLS version and HTTPS certificate checks".

## TTS Notes

Current TTS is a manual playback MVP:

- playback button is only shown on assistant messages;
- auto-play is disabled by default;
- only one message plays at a time;
- audio context is stopped and destroyed when leaving the tour page;
- the default voice should remain "冰糖" across frontend and backend.

Still requires real-device verification:

- expected voice quality;
- natural speaking speed;
- generation timeout behavior;
- segmented playback stability for long answers.

## OCR Notes

Current photo recognition is a frontend MVP:

- the user taps camera recognition;
- the mini-program requests camera permission and obtains an image;
- WeChat OCR or local fallback extracts text;
- extracted text is fuzzy-matched against the existing `/exhibits` list;
- failures fall back to text search.

Needs configuration and validation:

- WeChat OCR service ID;
- camera permission notice;
- no OCR call after the user cancels shooting;
- real-device recognition under exhibit labels, names, and low-light conditions.

## Common Tests

```bash
cd frontend
npm run test:markdown
npm run test:suggestions
npm run test:report
npm run test:all
node --check api/index.js
node --check api/stream.js
node --check store/tour.js
node --check pages/tour/tour.js
node --check pages/route/route.js
node --check pages/report/report.js
node --check pages/exhibit-scan/exhibit-scan.js
```

## Real-Device Test Focus

- iOS input bar and keyboard overlap.
- Android bottom action area alignment across resolutions.
- Suggestion bar should not leak hall/exhibit context.
- AI answers should copy as plain text.
- TTS play, stop, switch, and page-leave cleanup.
- OCR should not run after the user cancels shooting.
- Report visited halls, reflection, and record summary should match actual events.

## Launch Notes

- A test account is not equivalent to a formal mini-program release environment.
- Formal release needs a real AppID, developer permissions, upload permissions, and test members.
- If using a mainland China server and custom domain, formal WeChat mini-program release usually requires filing and legal-domain configuration.
- Any exposed AppSecret or API key must be rotated.
- Privacy policy, user agreement, camera permission notice, and AI-generated-content notice should be ready before release.
