# MuseAI WeChat Mini-Program Frontend

Chinese version: [README.md](./README.md)

MuseAI frontend is a native WeChat mini-program for the Banpo Museum guide experience. The current delivery goal is to complete the real-device closed loop from onboarding to persona, route, hall guide chat, exhibit recognition/search, TTS playback, and visit report before formal release.

## Current Stage

The frontend is now in the **launch preparation and release closeout stage**.

The planned mini-program features have completed real-device testing. The project should now focus on filing, real data, OCR decision-making, API-key governance, and release acceptance instead of expanding new features. See [上线准备.md](../project_materials/docs/上线准备.md) for the operational checklist.

HTTPS status should be read in two parts:

- Done: ICP filing for `banpo-museai.xyz` has passed; `api.banpo-museai.xyz` DNS, SSL certificate, and Nginx 443 reverse proxy are configured.
- Current development state: the mini-program frontend now uses the production HTTPS API `https://api.banpo-museai.xyz/api/v1`; the local backend and old public HTTP development endpoint remain only as commented fallback options.
- Done (WeChat side): the WeChat request legal domain is configured, and real-device testing passed with the DevTools "ignore legal domain" exemption turned off.

Remaining blockers:

- The current data is not the final official museum dataset.
- OCR service has not been purchased or configured; if OCR is not launched, hide the entry or keep text-search fallback.
- Third-party model credentials, quota, billing, rate limits, and alerts are maintained only in private operations records; this README does not publish provider-specific values.
- The backend is systemd-managed, application log retention is active, and the PostgreSQL backup timer has been restore-tested.
- Experience-version upload, tester distribution, and official acceptance with legal-domain checks enabled are not complete.

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
- Data-driven route page sourced only from active `/tour/halls` entries, then deterministically ordered by questionnaire persona, hall preferences, and time budget; dynamic hall names are not overwritten by the static canonical list, and a failed catalog request does not inject static route facts.
- Hall selection page with always-open halls first and temporary halls near the end.
- Tour page:
  - SSE streaming AI answers
  - suggestion bar rendered only from a successful backend response owned by the current guest session, hall, and exhibit; leaving a hall clears exhibit focus, and stopping an answer restores the current choices
  - Markdown rendering
  - copyable plain text AI answers
  - manual TTS playback
- Exhibit recognition/search:
  - text exhibit search
  - camera/OCR MVP
  - fallback to text search when OCR is unavailable
  - matched result can open exhibit detail
  - the real catalog is loaded sequentially in 100-item pages; an authoritative empty catalog stays empty, and production does not expose static mock exhibits
- Exhibit detail page with follow-up AI discussion.
- Visit report page:
  - visited halls counted from browsed hall badges: sending a message in a hall, or opening any exhibit detail page from that hall
  - question stats counted from user-sent messages, without deduplicating repeated question text
  - exhibit stats counted from exhibit detail views, deduped by exhibit
  - only trusted backend UUIDs count as viewed museum exhibits; local, mock, and name-only records remain display-only
  - reflection
  - hall-level record summary
  - save-record action that copies the report title, persona, statistics, and extracted summary as a plain-text visit note instead of showing generic next-step guidance
  - basic stats
- Mobile adaptation:
  - safe-area handling
  - measured keyboard height participates in flex layout so the raised input bar cannot cover the final answer
  - basic compatibility across screen sizes

## Not Complete Or Still Needs Release Acceptance

- Experience-version upload and tester distribution.
- If future features upload files or download remote file URLs, confirm uploadFile/downloadFile legal domains. The current request flow has passed real-device testing.
- OCR service purchase, service ID configuration, and real-device recognition stability.
- Official museum exhibit images, map, positions, and complete hall data; the current data is not final real data.
- API-key ownership, quota, billing, alerting, and rotation process.
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
│   └── banpo-halls.js    # Nine canonical hall slugs, names, and order
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

The default API endpoint is now the production HTTPS API:

```text
https://api.banpo-museai.xyz/api/v1
```

If the backend is running on this machine, you can temporarily switch to:

```text
http://127.0.0.1:8000/api/v1
```

The old public HTTP development endpoint is only for emergency fallback or historical debugging:

```text
http://122.152.232.190:3000/api/v1
```

The HTTPS request flow has passed real-device validation. The public HTTP dev entry should now be closed or restricted on the server.

The formal endpoint is only release-ready in the official WeChat environment when:

- domain filing is accepted;
- the HTTPS certificate is valid;
- the WeChat request legal domain is configured;
- WeChat DevTools works after disabling "ignore legal domain, web-view, TLS version and HTTPS certificate checks".

## TTS Notes

Current TTS is a manual playback MVP:

- playback button is only shown on assistant messages;
- auto-play is disabled by default;
- only one message plays at a time;
- audio context is stopped and destroyed when leaving the tour page;
- the concrete TTS provider and voice are controlled by private backend configuration and are not hardcoded in the frontend.

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

## Report Statistics Notes

The report page uses backend report fields first and merges local unsynced tour events to reduce gaps caused by page switches or network failure.

Visited halls and browsed hall badges are counted from:

- `exhibit_question`: the user sent a message in a hall.
- `exhibit_view`: the user opened an exhibit detail page.
- `assistant_answer`: retained as compatibility for historical completed-answer events; new stats are anchored to user-sent messages and exhibit detail views.

Simply entering a hall is not enough. A hall is counted after the user sends at least one message in that hall, or opens any exhibit detail page from that hall. Hall counts are deduped by canonical slug. Question totals count user-sent messages and do not dedupe repeated question text, matching the continue-last-tour AI conversation count. Exhibit views are counted separately and deduped by exhibit. The frontend uses only the nine canonical hall slugs from the Banpo hall contract and converts them to Chinese names for display.

Record summary data comes from hall-level local summaries saved when leaving a hall or opening the report, the current hall's latest local chat, and backend `record_notes`. The page keeps a concise extracted summary instead of rendering every question separately. The save-record action copies that summary with the title, persona, and statistics; generic `exploration_guidance` remains backend-compatible for older clients but is not rendered by the current page.

## Common Tests

```bash
cd frontend
npm run test:markdown
npm run test:suggestions
npm run test:hall-chat
npm run test:report
npm run test:preflight
npm run test:all
node --check api/index.js
node --check api/stream.js
node --check store/tour.js
node --check pages/tour/tour.js
node --check pages/hall/hall.js
node --check pages/route/route.js
node --check pages/report/report.js
node --check pages/exhibit-scan/exhibit-scan.js
node --check pages/exhibit-detail/exhibit-detail.js
```

`test:preflight` checks runtime code for non-allowlisted development endpoints, `localhost`, `:3000`, obvious secret patterns, and JavaScript syntax errors. It also validates the local `project.config.json`: only `app.*` and required API, asset, component, constant, page, state, style, and utility entries may enter the upload package. Runtime directories only accept the currently reviewed `.js`, `.json`, `.wxml`, `.wxss`, `.png`, and `.svg` extensions; other file types and symbolic links block release. README files, collaboration documents, test scripts, npm/Git files, and local project configuration must be explicitly excluded. The check does not read or modify a real `.env`, and it never prints the AppID.

`project.config.json` is not committed because it contains local project identity. Every developer who uploads a build must preserve the reviewed `packOptions.ignore` entries exactly and keep `uploadWithSourceMap=false`. Missing entries, additional unreviewed rules, or re-enabling source-map upload make the release preflight exit with a non-zero status; a boundary change must first update and review the preflight code. This prevents unrelated files and source maps from being uploaded, as well as incomplete packages caused by accidentally excluding a page.

## Real-Device Test Focus

- On both iOS and Android, open the keyboard during a long/streaming answer and stop once; the final bubble must remain fully above the input bar.
- Android bottom action area alignment across resolutions.
- Suggestion bar should not leak hall/exhibit context; leaving and re-entering a hall returns to hall suggestions, and stopping before/after the first chunk restores suggestions.
- AI answers should copy as plain text.
- TTS play, stop, switch, and page-leave cleanup.
- OCR should not run after the user cancels shooting.
- Report exhibit count, question count, duration, and record summary should match actual events; saving the record should copy the title, persona, statistics, and extracted summary.
  In particular, entering a hall should not count; sending a message should count the question and the hall; opening an exhibit detail page should count the exhibit and the hall; hall and exhibit counts must be deduped, while question count must not dedupe repeated text.

## Launch Notes

- A test account is not equivalent to a formal mini-program release environment.
- Formal release needs a real AppID, developer permissions, upload permissions, and test members.
- If using a mainland China server and custom domain, formal WeChat mini-program release usually requires filing and legal-domain configuration.
- Current server resource budget is 2 CPU cores / 8 GB RAM. Real-device testing should watch streaming answer latency, TTS waits, and report fallback behavior under weak networks.
- The frontend now points to `https://api.banpo-museai.xyz/api/v1`, and real-device testing has passed with the DevTools legal-domain exemption disabled. Run a full regression again before experience-version upload.
- Third-party model quota, billing, rate limits, and bill alerts must be confirmed in private operations records; this README does not expose a concrete provider or credential state.
- Current data is not the final official museum dataset. After replacing real data, revalidate hall filtering, exhibit stats, OCR search, and report summaries.
- Any exposed AppSecret or API key must be rotated.
- Privacy policy, user agreement, camera permission notice, and AI-generated-content notice should be ready before release.
