# Privacy Policy for KomaFlow

**Last Updated:** November 24, 2026

KomaFlow is an open-source browser extension that translates comic and manga images directly inside your browser. It is a GPL-3.0 fork of [Kites](https://github.com/Unheat/Kites); the upstream project and its authors are credited in [README.md](README.md#original-attribution--upstream-credit-gpl-30).

This Privacy Policy explains how KomaFlow handles your data when you use the extension.

---

## 1. Local-First Processing (Your Images Never Leave Your Device)

- **On-Device OCR & Inpainting:** Optical character recognition (PaddleOCR) and AI background inpainting (LaMa Manga, AOT-GAN) run entirely on your local machine using WebGPU and WebAssembly.
- **No Image Uploads:** Raw image files, comic panels, and reading materials are processed in-memory and stored locally in your browser's IndexedDB storage. They are never uploaded to our servers or any third-party image hosting services.
- **Configurable Storage Pruning:** Cached translation jobs and their image/text records are pruned according to your **History retention** setting: 1 day, 1 week (default), 1 month, or never. Pruning removes completed and failed jobs that are not inside a saved project; active jobs and project folders are left untouched. Choosing **never** disables automatic pruning.

---

## 2. Information We Handle

### A. Website Content (Text for Translation)

When you trigger a translation:

- Only the **extracted text strings** (dialogue, narration) from the comic speech bubbles are sent to your configured translation provider:
  - **Local WebGPU (WebLLM):** 100% on-device. No text is sent across the internet.
  - **Google Translate (Default):** Text is sent directly to Google Translate endpoints to retrieve translated strings. This is an unofficial endpoint, and Google's own terms and privacy policy apply.
  - **KomaFlow Cloud Shared Pool:** Text is sent to the Cloudflare Worker backend to route through community AI inference models.
  - **Custom APIs (BYOK):** Text is sent directly to your configured provider (OpenAI, Anthropic, Google Gemini, or an OpenAI-compatible endpoint) using your private API key and endpoint.

### B. Authentication Information (Optional)

- Signing in is **completely optional**. You can use KomaFlow with Google Translate, WebLLM, and Custom APIs without any account.
- If you choose to use the free **KomaFlow Cloud Shared Pool**, we use `chrome.identity` (Google OAuth) to verify your account.
- We only receive your public user identifier (`sub`), email address, and name to prevent abuse and manage daily rate-limiting quotas. We never access your Google password, contacts, Google Drive, or any other personal Google account data.

---

## 3. Data Storage & Security

- **Settings & API Keys:** Your preferred languages, engine selections, retention setting, and private API keys are saved strictly in `chrome.storage.local` on your device.
- **No Data Selling or Sharing:** We do not sell, rent, monetize, or share your personal data, reading habits, or translated text with any third-party advertisers or data brokers.
- **No Telemetry or Tracking:** KomaFlow contains no analytics SDKs, tracking pixels, or diagnostic beacons.

---

## 4. Permissions Used

- **`activeTab` & `<all_urls>`:** Required to discover comic `<img>` elements on web pages you browse and overlay translated speech bubbles in-place.
- **`contextMenus`:** Enables right-click "Translate Image" functionality.
- **`offscreen`:** Runs neural network models (WebGPU / WASM) in an isolated offscreen document without timing out service workers.
- **`storage`:** Stores your local preferences and API keys.
- **`identity`:** Used solely for optional Google OAuth authentication to the community translation pool.

---

## 5. Open Source Transparency

KomaFlow is licensed under the **GNU General Public License v3.0 (GPLv3)**. The entire source code, including build scripts and network requests, is publicly auditable on GitHub:

https://github.com/ZEenoz/KomaFlow

The original Kites project by Unheat is available at https://github.com/Unheat/Kites.

---

## 6. Contact & Inquiries

If you have questions, concerns, or bug reports regarding this Privacy Policy or KomaFlow:

- **GitHub Issues:** https://github.com/ZEenoz/KomaFlow/issues
- **Repository:** https://github.com/ZEenoz/KomaFlow
