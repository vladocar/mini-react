# Contributing

Thanks for your interest! Bug reports, ideas and pull requests are all welcome.

## Setup

You need Node.js 22 or newer.

```bash
git clone https://github.com/vladocar/mini-react.git
cd mini-react
npm install
npm test
```

## Making a change

1. Edit `src/mini-react.js`. It's the only source file for the library.
2. Add or update a test in `test/mini-react.test.mjs`.
3. Run `npm test`.
4. Run `npm run build` to regenerate `dist/`, and commit those files too.
   CI fails if `dist/` doesn't match `src/`.
5. If you changed behavior, update `README.md`, `CHANGELOG.md` (under an "Unreleased" heading),
   and the tutorial or demos where they mention it.

To see your change in the pages, open `demo.html`, `tutorial.html` or `bench.html` in your browser.
They load `dist/mini-react.global.js`, so run the build first.

## Guidelines

- **Keep it small and readable.** The library is meant to be read and learned from.
  Prefer clear code with a short comment over clever code. New features should be worth their size.
- **Match React where it makes sense.** If a feature exists in React, use the same name and behavior,
  or explain the difference in the README.
- **No runtime dependencies.**
- **Performance changes need numbers.** Run `bench.html` before and after, and include the results in the pull request.

## Reporting a bug

Open an issue with a small example that shows the problem, what you expected, and what happened instead.
The smaller the example, the faster it can be fixed.
