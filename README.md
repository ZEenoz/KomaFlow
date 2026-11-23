<div align="center">

[English](README.md) | [ภาษาไทย](README.th.md)

# KomaFlow

### Local-first manga and comic translation, running in your browser

**100% local-first · WebGPU-accelerated · Chrome Manifest V3**

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg?style=flat-square)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-success.svg?style=flat-square&logo=googlechrome&logoColor=white)](manifest.json)
[![WebGPU](https://img.shields.io/badge/Hardware-WebGPU-orange.svg?style=flat-square&logo=webgpu&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
[![React 19 + Vite](https://img.shields.io/badge/React%2019%20%2B%20Vite-8-646CFF.svg?style=flat-square&logo=vite&logoColor=white)](package.json)
[![Version](https://img.shields.io/badge/version-1.5.2-1B365D.svg?style=flat-square)](manifest.json)

<br/>

[![KomaFlow — local-first manga translation in the browser](./README_images/Gemini_Generated_Image_f7lh52f7lh52f7lh.jpeg)](./README_images/Gemini_Generated_Image_f7lh52f7lh52f7lh.jpeg)

</div>

---

> **Fork notice:** KomaFlow is an independent fork of **[Unheat/Kites](https://github.com/Unheat/Kites)**, based on Kites v1.5.2 and distributed under the **GNU General Public License v3.0** (GPL-3.0-or-later; see [LICENSE](LICENSE)). It is not an official Kites release. See [Original Project & License Acknowledgements](#original-project--license-acknowledgements) for the full attribution.

## Overview

KomaFlow is a **100% local-first, WebGPU-accelerated manga and comic translator** that runs as a Chrome/Chromium Manifest V3 extension. It finds text on a page, removes the original lettering, translates the dialogue, and typesets the result back into the artwork without leaving the browser.

The image pipeline is local by design:

- **OCR, inpainting, typesetting, and optional colorization run on your device.** Raw pages, panels, and translated images are never uploaded.
- **Translation can also run fully locally** with WebLLM on WebGPU. If you choose a cloud engine, KomaFlow sends the extracted text and the translation settings needed for that request; images never leave the browser.
- **No telemetry, analytics SDKs, or tracking pixels.** Settings and API keys stay in browser storage.
- **Models are downloaded on demand** and cached locally. Nothing about your reading history is needed to use the extension.

KomaFlow is built for Japanese, Chinese, Korean, and other source languages, with 50+ target languages including English, Thai, Vietnamese, and Indonesian. It works on ordinary manga pages, long-strip webtoons, image galleries, Pixiv, X/Twitter, and reader sites that need a custom image selector.

### At a glance

| Item | Detail |
| :--- | :--- |
| Extension version | 1.5.2 |
| Platform | Chrome/Chromium with Manifest V3; WebGPU for local LLM and neural features |
| Core runtime | Persistent offscreen document using WebGPU, ONNX Runtime Web, and WebLLM |
| UI stack | React 19, TypeScript, Vite, Tailwind CSS |
| Local storage | IndexedDB through Dexie; preferences in `chrome.storage.local` |
| License | GNU GPL v3.0 or later |
| Upstream | [Unheat/Kites](https://github.com/Unheat/Kites) v1.5.2 |

---

## See it in action

### Chinese → English, with optional AI colorization

The same page after OCR, inpainting, translation, balloon-aware typesetting, and the optional Manga Colorizer. Artwork by [@almondnuts117](https://x.com/almondnuts117).

<div align="center">
<table>
  <tr>
    <th width="50%" align="center">Original Chinese page</th>
    <th width="50%" align="center">KomaFlow English translation + colorization</th>
  </tr>
  <tr>
    <td align="center">
      <img src="./README_images/input/color-bubble-original.jpg" alt="Original grayscale Chinese manga page" width="100%" />
    </td>
    <td align="center">
      <img src="./README_images/result/color-bubble.png" alt="KomaFlow translated and colorized English manga page with speech balloon wrapping" width="100%" />
    </td>
  </tr>
</table>
</div>

### Japanese → English

Story: *佐藤さんは知っていた* by [@09ra_19ra](https://x.com/09ra_19ra).

<div align="center">
<table>
  <tr>
    <th width="50%" align="center">Original Japanese page</th>
    <th width="50%" align="center">KomaFlow English translation</th>
  </tr>
  <tr>
    <td align="center">
      <img src="./README_images/input/demo2.jpeg" alt="Original Japanese manga page" width="100%" />
    </td>
    <td align="center">
      <img src="./README_images/result/demo2_result.png" alt="KomaFlow English translated manga page" width="100%" />
    </td>
  </tr>
</table>
</div>

### Japanese → Vietnamese

Source: [Pixiv artwork #145272482](https://www.pixiv.net/en/artworks/145272482).

<div align="center">
<table>
  <tr>
    <th width="50%" align="center">Original Japanese page</th>
    <th width="50%" align="center">KomaFlow Vietnamese translation</th>
  </tr>
  <tr>
    <td align="center">
      <img src="./README_images/input/demo7.jpg" alt="Original Japanese manga page with speech balloons" width="100%" />
    </td>
    <td align="center">
      <img src="./README_images/result/demo7_result.png" alt="KomaFlow Vietnamese translated manga page with fitted typography" width="100%" />
    </td>
  </tr>
</table>
</div>

---

## What's New in KomaFlow

KomaFlow is a fork of upstream Kites v1.5.2 with a focused set of fixes and UI work. These are the changes that matter most in day-to-day reading.

### 1. Custom and imported WebFonts render reliably

- **Registration happens in the persistent offscreen document** that owns the rendering canvas, not in a short-lived popup or content frame. Imported fonts and catalog downloads are registered with the `FontFace` API and added to `document.fonts` in the context that actually measures and paints text.
- **Stored fonts are re-registered when the offscreen document boots.** A browser restart, service-worker recycle, or fresh reader session no longer leaves translated text measured against a fallback font.
- **Imports are validated before they are persisted.** Font files must pass `FontFace.load()`, catalog downloads are checked against pinned SHA-256 hashes, and family names are sanitized. A broken file is rejected instead of becoming an unusable selection.
- **Complete CSS font stacks are preserved.** The renderer previously wrapped an already-quoted stack in another pair of quotes, producing invalid CSS such as quoting the whole `"CC Wild Words", sans-serif` value as one family. Chrome silently ignored the invalid `ctx.font` setter, kept stale fallback metrics, and measured different glyphs than it painted. KomaFlow now passes complete stacks to both CSS and Canvas, so sizing, line wrapping, contour fitting, and Studio outlines agree.

This affects the Popup font picker and KomaFlow Studio, including cold starts, font switching, repeated translations on the same page, and imported fonts that are used on several pages.

### 2. Full Text Rendering Options

The Popup now exposes a complete set of typography controls that apply across every typesetting route, not just one engine:

| Control | Range | Behavior |
| :--- | :--- | :--- |
| **Bold** | On / off | Uses the bold face of the selected family and the matching measurement metrics. |
| **Italic** | On / off | Uses the italic face and preserves the same fit and alignment rules. |
| **Min Font Size** | 4–20 px, default 6 px | A **hard floor after fitting**, not a starting size hint. The final size never drops below the value. |
| **Text Alignment** | Auto / Left / Center / Right | Auto keeps the source layout's natural alignment; the other choices apply consistently to fitted text. |
| **Disable Stroke** | On / off | Removes the outline while preserving adaptive fill color, so text stays legible against the sampled background. |

The minimum-size floor is enforced in **Contour**, **Simple Rect**, **AutoBalloon**, the **Legacy** renderer, and **Studio OCR** typesetting. Changing any render option updates the render-config signature, so cached layouts from a previous setting are not reused by the next translation.

### 3. A more reliable Page and Chapter Reader scanner

The reader scanner was hardened around the failure modes common on real manga sites:

- **Canonical URL normalization.** Volatile cache-busting, tracking (`utm_*`, `x-amz-*`), and hash parameters are stripped, while pagination and image-proxy parameters are kept and sorted. The same page served with changing cache or tracking query parameters is recognized as one page instead of duplicates.
- **Broader lazy-load discovery.** KomaFlow promotes known `data-src` / `data-original` / `data-lazy-src` attributes, `data-srcset`, and `loading="eager"`; accepts 0×0 or not-yet-measured pending images; and still filters out avatars, logos, ads, and recommendation thumbnails.
- **Expanded fast-scroll preload.** Up to **180 scroll cycles per scroll target** (the page and its inner scroll container can each contribute, so up to 360 total), bounded by a 6-second budget, forcing lazy pages to load before the chapter list is built, then restoring the original scroll position.
- **SPA navigation reset.** `popstate`, `hashchange`, and URL changes reset the chapter context so a new route is not merged with the previous chapter's image list.
- **Live updates while the Reader is open.** A `MutationObserver` plus image `load` events keep adding pages that appear after the initial scan, without freezing the reader or rescanning the whole document on every mutation.
- **Header Rescan button.** One click promotes lazy attributes, reruns the fast preload, and refreshes the page list without closing the reader.
- **Render-config cache invalidation.** When typography settings change, the content script increments a render-config version and drops cached render results instead of displaying pages rendered with the old font settings.

### 4. Ocean & Ice Navy theme across every surface

The Popup, KomaFlow Studio, and Reader overlay now share one palette:

| Token | Hex | Role |
| :--- | :--- | :--- |
| Deep navy | `#1B365D` | Primary hover, structural emphasis, dark surfaces |
| Cobalt | `#005A9C` | Primary filled controls, selected states, progress |
| Sky | `#60C1E5` | Dark-mode accent text, icons, selection, focus |
| Ice | `#A0E0EF` | Soft highlights and hover text on dark surfaces |

Semantic colors (errors, warnings, success) remain separate, and the switch control gained a palette-matched focus ring. The result is a consistent navy-and-ice interface from the toolbar popup to the full-screen editor and the in-page reader.

> _Screenshots in this README were captured before the KomaFlow palette migration and still show the upstream Kites UI. Refreshed captures are tracked as a follow-up; the extension itself ships with the theme described above._

---

## Feature tour

### In-place translation modes

KomaFlow overlays translated pages directly on the site you are reading. Pick the mode that matches how you browse:

| Mode | How it works | Best for |
| :--- | :--- | :--- |
| **Hover** | A small floating badge appears over a comic image; click it to translate in place. | Occasional translation while browsing feeds and galleries. |
| **Persistent** | Translation badges stay visible on every detected image. | Reading a page where you want a clear action on each panel. |
| **Auto-Translate** | New panels are queued automatically as they enter the viewport while you scroll. | Long chapters and image-heavy feeds. |
| **Screen Crop** | Drag a region of the screen, including protected canvas, WebGL, or video content, and translate that crop. | Games, canvas readers, and sites where images cannot be read directly. |
| **Right-click** | Use the browser context menu on any image and choose the KomaFlow action. | One-off images and sites with unusual markup. |

Screen Crop can repeat the previous region with a shortcut, which is useful for visual novels and pages that render the same frame repeatedly. Hovered translated images support **hold-to-peek**: tap `F` to toggle the original permanently, or hold it for more than 200 ms and release to snap back to the translation.

[![KomaFlow hover translation badge over a manga panel](./README_images/UI-feature/hover-inplace-preview.png)](./README_images/UI-feature/hover-inplace-preview.png)

### Keyboard shortcuts

| Action | Shortcut | Scope |
| :--- | :--- | :--- |
| Translate the image under the pointer | `Alt+Shift+Z` (`Ctrl+Shift+Z` on macOS) | Page |
| Start a screen-crop selection | `Alt+Shift+X` (`Ctrl+Shift+X` on macOS) | Page |
| Repeat the last screen crop | `Alt+Shift+C` (`Ctrl+Shift+C` on macOS) | Page |
| Open the Chapter Reader | `Alt+Shift+M` (`Ctrl+Shift+M` on macOS) | Page |
| Toggle or hold-to-peek the original | `F` | Page, on a translated hovered image |
| Close the Reader | `Esc` | Reader |
| Toggle the original page | `F` | Reader |
| Previous / next page | `←` / `→` | Single-page and double-page Reader |
| Cycle webtoon width | `W` | Webtoon Reader |

Chrome commands can be rebound at `chrome://extensions/shortcuts` if a combination conflicts with a site or another extension. The in-page Translate, crop, and reader keys are handled by the content script and stay on these combinations even after the Chrome command is rebound; unbinding a Chrome command does not release its in-page handler.

### Chapter Reader and ZIP export

The Chapter Reader turns a paginated manga chapter into one continuous reading surface.

[![KomaFlow Chapter Reader with a chapter open](./README_images/UI-feature/reader.jpg)](./README_images/UI-feature/reader.png)

- **Fast Scan** walks the page with the lazy-load preloader and builds a deduplicated, spatially sorted page list.
- **Webtoon, single-page, and double-page modes** cover tall strips, standard pages, and spreads.
- **RTL and LTR reading directions** are supported, with the arrow keys following the selected direction.
- **Webtoon width cycling** switches between medium, large, and full-width strips with `W`.
- **Batch chapter translation** translates every detected page in one run with per-page progress and error states.
- **1-click ZIP export** packages translated pages as `<chapter-title>-translated.zip` for offline reading. The archive uses STORE (no compression), and a chapter must not exceed 256 MiB or 65,535 entries.
- **Header Rescan** refreshes the page list in place when a site lazy-loads more pages after the reader opens.
- **No server upload.** The archive is assembled in the browser and saved through the normal download flow.

### Built-in KomaFlow Studio

KomaFlow Studio is a full-screen editor for fixing a translation, adjusting lettering, or cleaning artwork by hand. Open it from the Popup's Studio button in a new tab.

[![KomaFlow Studio editing a translated page](./README_images/UI-feature/kite_studio_editing.jpg)](./README_images/UI-feature/studio-editor.png)

- **Direct inline editing:** double-click a speech balloon and edit the text in place, with live typesetting reflow and vertical centering.
- **Interactive canvas:** move and resize balloons with eight-point handles, then resize the text region independently.
- **Inpaint brush:** erase leftover lettering, SFX, or artwork defects locally with adjustable brush strokes.
- **Side-by-side verification:** compare the original, cleaned plate, and typeset result.
- **Typography controls:** font family, size, color, alignment, line height, bold, italic, stroke, and minimum-size options.
- **Studio OCR:** import an image page and run OCR plus typesetting inside the editor.
- **Export:** save a translated page at the original resolution, or export the project for later editing.

### Extension controls

The Popup keeps the everyday controls in one place: enable/disable, source and target language, engine selection, the Chapter Reader, and the translate action. The Settings view exposes the rest without hiding it in per-site menus.

<div align="center">
<table>
  <tr>
    <th width="33%" align="center">KomaFlow Popup</th>
    <th width="33%" align="center">Chapter Reader panel</th>
    <th width="34%" align="center">Engine and typography settings</th>
  </tr>
  <tr>
    <td align="center">
      <img src="./README_images/UI-feature/main-panel.jpg" alt="KomaFlow popup with language selection, engine choice, and translate controls" width="95%" />
    </td>
    <td align="center">
      <img src="./README_images/UI-feature/reader-panel.jpg" alt="KomaFlow chapter reader and scanner panel" width="95%" />
    </td>
    <td align="center">
      <img src="./README_images/UI-feature/setting-panel.jpg" alt="KomaFlow settings panel with engine and text rendering options" width="95%" />
    </td>
  </tr>
</table>
</div>

### Custom glossary and site domain rules

- **Custom Glossary:** map source names, honorifics, and terminology to preferred translations. Matching entries are injected into the prompt for WebLLM, the Cloud Shared Pool, and custom LLM APIs, and only terms relevant to the current batch are included. Google Translate does not consume glossary entries. When a cloud engine is selected, glossary text is part of the request sent to that provider, so do not put sensitive data in it.
- **Site Domain Rules:** add a custom CSS image selector for a domain, enable or disable KomaFlow per hostname, and keep non-standard reader layouts working without changing the global scan.

---

## AI engines and pipeline

### Pipeline at a glance

| Stage | What happens | Where it runs |
| :--- | :--- | :--- |
| 1. Discovery | Finds comic images, panels, and chapter pages; promotes lazy sources and filters UI noise. | Content script, local |
| 2. OCR | Detects and recognizes dialogue with PaddleOCR; tall strips are tiled in 1D. | Offscreen document, WebGPU or WASM |
| 3. Grouping | Merges adjacent text lines, filters furigana and noise, and orders regions for reading. | Local |
| 4. Inpainting | Removes the source lettering and reconstructs the background under it. | Offscreen document, ONNX Runtime Web |
| 5. Translation | Translates grouped dialogue with the selected engine, optional glossary, and fallback chain. | Local WebLLM or a cloud provider |
| 6. Typesetting | Fits text to the balloon or caption region, wraps lines, and renders the final glyphs. | Local canvas pipeline |
| 7. Colorization | Optional AI coloring of the cleaned page. | Offscreen document, ONNX Runtime Web |

### Engine overview

| Component | Available options | Execution | Notes |
| :--- | :--- | :--- | :--- |
| **Translation** | **Google Translate** (default), **Cloud Shared Pool**, **WebLLM**, **Custom API** | Local or cloud, per engine | Only extracted dialogue and the configured request settings leave the browser, and only for cloud engines. Images are never sent. |
| **Inpainting** | None (Bypass), Simple Fill, Precise Fill, Telea Diffusion, LaMa Manga, AOT-GAN | Local | Four built-in methods plus two neural models (~50 MB and ~60 MB). |
| **OCR** | 10 PaddleOCR presets: v6-small (default), v6-medium, v6-tiny, v5-mobile, v5-server, v5-en-mobile, v4-mobile, v4-server, v3-mobile, v3-japanese-mobile | Local | WebGPU with a WASM fallback; automatic 1D tiling for very tall webtoons. |
| **Bubble Fit** | Disabled, Heuristic, YOLO (AI) | Local | `off`, `heuristic`, and `neural` are the real modes. MST is internal grouping geometry, not a third selectable mode. YOLO adds an ~11 MB model. |
| **Color-Bubble** | Per-bubble text color detection + font color match + balloon wrap; optional Manga Colorizer | Local | Text color detection is canvas/K-Means based; the optional SEResNeXt U-Net colorizer is ~61 MB. |

### Translation engines

- **Google Translate (`gg-translate`, default):** uses the public GTX endpoint with no API key. Requests are batched with a 1,800-character cap and an 8-second attempt timeout. It is convenient and free, but it is an unofficial endpoint and availability, rate limits, and output quality are controlled by Google, not by KomaFlow.
- **Cloud Shared Pool:** a Cloudflare Worker service with optional Google OAuth. The quota is **100 successful translations per 24-hour window that starts at your first translation** (it does not slide with each request), **250 attempts per day**, and a global admission cap of **10,000 requests per day**. It is intended for occasional use and can route through community-hosted models.
- **WebLLM:** runs open-weight translation models locally on WebGPU. The bundled registry contains **59 models** across Qwen 3.5/3/2.5/2, Gemma 2/3/4, Llama 3.1/3.2, Phi-3.5/4, Mistral/Ministral, and LFM2.5. The model downloads once and then works offline, subject to GPU memory and the model's context window.
- **Custom API:** supports `openai`, `openai-compatible`, `gemini`, and `claude` providers. `openai-compatible` covers local Ollama, vLLM, LM Studio, and similar endpoints. Keys and endpoints are stored in local extension storage; requests go directly to the provider you configure.

The fallback chain is user-configurable and empty by default. If the selected engine fails, KomaFlow does not silently reroute unless you add fallback engines in Settings.

### Inpainting options

| ID | Label | Tag | Model |
| :--- | :--- | :--- | :--- |
| `none` | None (Bypass) | Raw Canvas | Built-in |
| `simple` | Simple Fill | Fast Color | Built-in |
| `stroke-fill` | Precise Fill | Text Stroke | Built-in |
| `telea` | Telea Diffusion | Fast Diffusion | Built-in |
| `lama-manga` | LaMa Manga | Neural Dynamic | ~50 MB |
| `aotgan` | AOT-GAN | Neural High-Detail | ~60 MB |

### Performance notes

- **WebGPU is recommended** for OCR, WebLLM, and neural inpainting. PaddleOCR and the inpainting runner can fall back to WASM/CPU, at lower speed.
- **First use downloads models.** LaMa, AOT-GAN, YOLO bubble detection, the colorizer, and WebLLM weights are cached locally after download.
- **Long-strip pages** are processed with 1D in-memory canvas tiling, so extreme webtoon heights are not silently resized down to a single GPU texture limit.
- **Quality depends on the source.** Small or low-resolution lettering, noisy scans, unusual fonts, and heavy sound effects are harder for OCR and inpainting; Studio is there for the pages that need a human pass.

---

## Installation

### Requirements

- A recent **Chrome, Chromium, Edge, Brave, or other Chromium browser** that supports Manifest V3.
- **WebGPU** for local LLM translation and the neural engines. Enable hardware acceleration in the browser and make sure `chrome://gpu/` reports WebGPU as hardware accelerated.
- **Node.js 22.14** (pinned in `.nvmrc`) and **npm 10+** only if you build from source.

### Option 1: Pre-built release ZIP

1. Open the **[KomaFlow Releases page](https://github.com/ZEenoz/KomaFlow/releases/latest)**.
2. Download the latest `.zip` release archive.
3. Unzip it into a permanent folder. Do not delete or move the folder after loading the extension.
4. Open `chrome://extensions/`.
5. Enable **Developer mode** in the top-right corner.
6. Click **Load unpacked** and select the unzipped folder.
7. Pin **KomaFlow** to the toolbar and open the Popup.

If the Releases page has no downloadable build yet, use Option 2. Loading a local `dist/` folder is the same installation mechanism.

### Option 2: Build from source

```bash
# 1. Clone the repository
git clone https://github.com/ZEenoz/KomaFlow.git
cd KomaFlow

# 2. Install exact dependencies
npm ci

# 3. Copy WASM runtimes, type-check, and build the extension
npm run build
```

Then:

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the generated `dist/` folder.
4. Pin **KomaFlow** and refresh the extension after rebuilding.

The build copies the ONNX Runtime WASM assets, runs the TypeScript project build, and bundles the Popup, content scripts, offscreen document, and Studio through Vite.

---

## Development and testing

```bash
# Lint (oxlint)
npm run lint

# Unit and integration tests (Vitest)
npm test

# Production build: copy WASM, type-check, bundle
npm run build
```

Useful additional checks:

```bash
npm run docs:check     # documentation coverage and TSDoc shape
npm run docs:api       # generate the TypeDoc API reference
npm run test:e2e       # browser end-to-end test (Chrome/Chromium)
npm run worker:test    # Cloudflare Worker tests
npm run dev            # Vite dev server with HMR
```

**Documentation**

- **[Documentation hub](docs/README.md)** — architecture, pipeline contracts, setup, testing, coding standards, and known limitations.
- **[Architecture overview](docs/architecture/overview.md)** — MV3 runtime topology, storage, and privacy boundaries.
- **[Translation pipeline](docs/architecture/pipeline.md)** — OCR → grouping → inpainting → translation → typesetting.
- **[Pipeline map](docs/workflow.html)** — self-contained interactive artifact; open the HTML file directly in a browser.
- **[Contributing guide](CONTRIBUTING.md)** — environment setup, quality gates, commit conventions, and pull request process.
- **[Third-party notices](THIRD_PARTY_NOTICES.md)** — licenses, pinned revisions, and ported functionality.

Read [AGENTS.md](AGENTS.md) and [docs/doc_guide.md](docs/doc_guide.md) before making architectural changes. The verification gate for a pull request is `npm run lint`, `npm test`, `npm run build`, and the documentation checks relevant to the files you touched.

---

## Privacy and data flow

KomaFlow follows a local-first data model:

1. **Page images stay local.** The content script and offscreen document read pixels in memory; translated images and Studio clean plates are stored in the browser's IndexedDB, not uploaded.
2. **OCR and inpainting run locally.** PaddleOCR, LaMa, AOT-GAN, Telea, and the typesetting canvas never send image data over the network.
3. **Translation is the only network stage.** Google Translate, the Cloud Shared Pool, and custom APIs receive the extracted dialogue text, plus glossary or custom-prompt settings when enabled. WebLLM and a local OpenAI-compatible endpoint keep that text on your machine as well.
4. **OAuth is optional.** Only the Cloud Shared Pool needs a Google sign-in; KomaFlow receives the account identifier, email, and name needed for quota enforcement. A Google account is not required for Google Translate, WebLLM, or custom APIs.
5. **Settings and keys are local.** API keys live in `chrome.storage.local`, and history retention is configurable (1 day, 1 week, 1 month, or never; default one week).
6. **No analytics.** There are no analytics SDKs, tracking pixels, or diagnostic beacons in the extension.

The detailed policy is in [PRIVACY.md](PRIVACY.md). If a cloud translation provider is selected, that provider's own privacy terms apply to the text it receives.

---

## Project layout

```text
src/
  background/     MV3 service worker, message routing, state normalization
  content/        page scanner, overlays, reader, shortcuts, ZIP export
  offscreen/      WebGPU/ONNX/WebLLM pipeline and engine implementations
  popup/          settings, engine selection, glossary, site rules
  shared/         types, catalogs, storage keys, font library, utilities
  studio/         KomaFlow Studio editor and canvas tools
worker/           Cloudflare Worker for the Cloud Shared Pool
docs/             architecture, ADRs, development guides, dev history
README_images/    screenshots and comparison images used in this README
```

The extension source is intentionally modular: engine catalogs have one source of truth in `src/shared/`, the offscreen document owns model lifecycles, and the content script is split into scanner, media-target, reader, and shortcut modules rather than accumulating in one file.

---

## Original Project & License Acknowledgements

KomaFlow would not exist without the original project and its community.

**Original project:** **[Unheat/Kites](https://github.com/Unheat/Kites)** — Spatial Image & Manga Translator, the upstream codebase from which KomaFlow is forked. KomaFlow is based on Kites v1.5.2 and remains under the **GNU General Public License v3.0** (GPL-3.0-or-later). The upstream copyright notices and license obligations are preserved; the full license text is in [LICENSE](LICENSE). KomaFlow is an independent fork and is not endorsed by or affiliated with the upstream maintainers.

The upstream project in turn builds on these open-source works, which KomaFlow also credits and preserves:

- **[manga-image-translator (Cotrans)](https://github.com/zyddnys/manga-image-translator)** — spatial text grouping, Kruskal MST geometry, and the DEFAULT renderer ported to TypeScript. GPL-3.0.
- **[xianscan-rust](https://github.com/ArbenApura/xianscan-rust)** — dynamic patch inpainting, OCR noise filtering, text cleaning, and balanced wrapping patterns. MIT.
- **[koharu](https://github.com/koharu-rs/koharu)** — contour typesetting concepts: dynamic-programming line breaking, contour font search, and hyphenation recovery. GPL-3.0.
- **[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)** — multilingual text detection and recognition models. Apache-2.0.
- **[@mlc-ai/web-llm](https://github.com/mlc-ai/web-llm)** — WebGPU runtime for browser-native language models. Apache-2.0.
- **[pyheal](https://github.com/olvb/pyheal) & [OpenCV](https://github.com/opencv/opencv)** — Telea Fast Marching Method inpainting reference. Apache-2.0 / GPL-3.0 components.
- **[InpaintWeb](https://github.com/lxfater/inpaint-web)** — browser-side LaMa inpainting architecture reference. MIT.
- **[hypher](https://github.com/typst/hypher) & [linebreak](https://github.com/devongovett/linebreaker)** — Liang hyphenation patterns and UAX #14 line-break opportunities. MIT.
- **[CRXJS (chrome-extension-tools)](https://github.com/crxjs/chrome-extension-tools)** — Manifest V3 Vite plugin used by the build. MIT.
- **[ONNX Runtime Web](https://github.com/microsoft/onnxruntime)** — in-browser inference for OCR, inpainting, and colorization models. MIT.
- **MTO Comic Fonts** — community fonts bundled with the font library for scanlation-friendly typesetting. See the font notices in the repository.

Full license texts, pinned revisions, and a per-module list of ported functionality are in **[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)**.

KomaFlow's own changes are distributed under the same GPL-3.0-or-later terms. If you redistribute a build, keep the source available and preserve the license and attribution notices.

---

<div align="center">
  <sub>KomaFlow is a community fork for local-first manga translation. Please support the original creators and respect the rights of the artists whose work you read.</sub>
</div>
