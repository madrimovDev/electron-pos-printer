# Contributing to electron-pos-printer

Thank you for your interest in contributing! Here's everything you need to get started.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Electron >= 28 (for testing)

### Setup

```bash
# 1. Fork the repository on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/electron-pos-printer.git
cd electron-pos-printer

# 3. Install dependencies
npm install

# 4. Create a branch for your changes
git checkout -b feat/your-feature-name
```

## Development

```bash
npm run build       # Build once
npm run dev         # Watch mode
npm run test:run    # Run tests
npm run typecheck   # Type checking
```

## Project Structure

```
src/
├── types/          # TypeScript interfaces and types
├── commands/       # ESC/POS command constants and builder
├── printer/        # Printer detection and raw printing
├── utils/          # Format, HTML builder, ReceiptBuilder
└── electron/       # Main, Preload, Renderer integration
example/            # Example Electron app
```

## Contribution Guidelines

### Reporting Bugs

1. Search [existing issues](https://github.com/madrimovDev/electron-pos-printer/issues) first
2. If not found, open a [Bug Report](https://github.com/madrimovDev/electron-pos-printer/issues/new/choose)
3. Include: OS, Electron version, package version, and a minimal code sample

### Suggesting Features

1. Open a [Feature Request](https://github.com/madrimovDev/electron-pos-printer/issues/new/choose)
2. Describe the problem it solves and how you'd like the API to look

### Submitting a Pull Request

1. Make sure all tests pass: `npm run test:run`
2. Make sure build succeeds: `npm run build`
3. Make sure types are correct: `npm run typecheck`
4. Write or update tests for your changes
5. Fill out the PR template

### Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add image printing support
fix: correct barcode alignment on 58mm paper
docs: update ReceiptBuilder API reference
chore: bump tsup to v9
```

## Code Style

- TypeScript strict mode is enabled — no `any` types
- Keep functions small and focused
- Add JSDoc comments for public APIs
- Cross-platform support is required (Linux, macOS, Windows)

## Testing

- Add tests in the same directory as the source file (e.g. `format.test.ts`)
- Use [Vitest](https://vitest.dev/) for unit tests
- Test both 58mm and 80mm paper widths where relevant

## Questions?

Open a [Discussion](https://github.com/madrimovDev/electron-pos-printer/discussions) — not an issue.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
