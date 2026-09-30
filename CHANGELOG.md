# Changelog

All notable changes to this project are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-28

First release.

### Added

- `h` / `createElement`, `Fragment`, `createRoot`, `render`.
- Hooks: `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useRef`, `useMemo`, `useCallback`, `useContext`.
- `createContext` with providers that update their readers, even behind `memo`.
- `memo(Component, areEqual?)`.
- `flushSync` for applying updates immediately.
- Keyed diffing with minimal DOM moves (longest increasing subsequence).
- Batched updates in a microtask, parents rendered before children.
- SVG support, React-style props (`className`, `htmlFor`, style objects, `onChange` on every keystroke).
- Browser builds: `dist/mini-react.global.js` and `dist/mini-react.min.js`.
- Demos (`demo.html`), tutorial (`tutorial.html`) and benchmark against React 18 (`bench.html`).
- 25 tests.

[0.1.0]: https://github.com/vladocar/mini-react/releases/tag/v0.1.0
