# 0007 — WebAssembly for camera follow

**Status:** accepted · 2026-11-26

Camera follow (Media › Video input › Camera) finds people and their body landmarks in a camera's
picture with MediaPipe's pose model, in the control window, on this computer (no frame leaves
it). MediaPipe runs as WebAssembly, which the production CSP of §17.1 blocks: compiling a
WebAssembly module needs `'wasm-unsafe-eval'` in `script-src`.

**Decision.** Production and dev CSPs add `'wasm-unsafe-eval'` to `script-src`, nothing else.
That source allows `WebAssembly.compile`/`instantiate` only; JavaScript `eval`, `new Function`,
inline scripts and remote scripts stay blocked. The module and the model are bundled files served
from `app://` like every other script (no network). `security.test.ts` asserts exactly this
(no `unsafe-eval`, no inline scripts, `'wasm-unsafe-eval'` present).

**Alternatives.** TensorFlow.js on its WebGL backend needs no WebAssembly, but is several times
larger, slower on integrated GPUs, and has no maintained multi-person pose model with the
landmarks framing needs (eyes, shoulders, hips). Running detection in the main process (Node
allows WebAssembly) would mean sending frames over IPC ~12 times a second and putting heavy work
on the process that keeps every window and the stream going. A separate page with its own CSP
was possible but adds a window, frame plumbing and the same exception in another place.
