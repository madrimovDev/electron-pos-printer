# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`electron-pos-printer` is a TypeScript library for thermal POS printer support in Electron applications. It supports 58mm and 80mm thermal printers with ESC/POS commands.

## Build Commands

```bash
npm run build      # Build the package (tsup)
npm run dev        # Watch mode for development
npm run test       # Run tests (vitest)
npm run test:run   # Run tests once
npm run typecheck  # TypeScript type checking
```

## Architecture

### Directory Structure
- `src/types/` - TypeScript interfaces and type definitions
- `src/commands/` - ESC/POS command constants and builders
- `src/printer/` - Printer detection and raw printing (cross-platform)
- `src/utils/` - Formatting utilities, HTML builder, and ReceiptBuilder class
- `src/electron/` - Electron IPC integration (main, preload, renderer)
- `example/` - Working Electron example app for testing

### Key Components

**ReceiptBuilder** (`src/utils/receipt-builder.ts`): Fluent API for building receipts with support for:
- Text formatting (bold, underline, alignment, sizes)
- Tables with automatic column width calculation
- Barcodes and QR codes
- Currency formatting
- Receipt templates via `fromData()`

**ESC/POS Builder** (`src/commands/escpos-builder.ts`): Converts PrintContent to raw ESC/POS bytes

**Raw Printer** (`src/printer/raw-printer.ts`): Cross-platform raw printing:
- Linux/macOS: `lp -d <printer> -o raw` (CUPS)
- Windows: PowerShell with .NET RawPrinterHelper (winspool.drv)

**Electron Integration**:
- Main process: `setupPrinterIPC()` registers IPC handlers
- Preload: `exposePosPrinterAPI()` exposes safe API to renderer
- Renderer: `PosPrinter` class and `createPosPrinter()` factory

### Paper Width Support
- 58mm: 32 characters per line
- 80mm: 48 characters per line

### IPC Channels
- `pos-printer:get-printers` - Get available printers
- `pos-printer:print` - Print content

## Code Patterns

- Uses tsup for bundling (CJS + ESM + DTS)
- Electron is a peer dependency (>=28.0.0)
- All printer operations are async
- Raw ESC/POS printing for thermal printers
- Cross-platform support (Linux, macOS, Windows)
