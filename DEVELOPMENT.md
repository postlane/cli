# Development Setup

## Required Directory Layout

The `postlane/cli` package has a **build-time dependency** on the `postlane/prompts` repository. The prompts repo must be cloned as a sibling directory for builds and tests to work.

**Expected layout:**

```
~/GitHub/postlane/
├── cli/              # This repo
├── prompts/          # Required sibling - skill files bundled at build time
├── desktop/          # Desktop app repo
└── internal/         # Private planning repo
```

**Relative path used in build scripts:** `../prompts/`

## Building

The `prebuild` script automatically copies skill files from `../prompts/` into `bundled-skills/` before compilation:

```bash
npm run build
```

If the prompts repo is not present, the build will fail with an explicit error.

## Testing

Tests also require the sibling prompts directory:

```bash
npm test
```

## First-Time Setup

1. Clone both repositories as siblings:
   ```bash
   cd ~/GitHub/postlane
   git clone https://github.com/postlane/cli.git
   git clone https://github.com/postlane/prompts.git
   ```

2. Install dependencies:
   ```bash
   cd cli
   npm install
   ```

3. Verify the setup:
   ```bash
   npm run build
   npm test
   ```
