# Safari Xcode Module

A WXT module that automatically converts Safari extensions to Xcode projects, configures related settings, and optionally archives & exports `.pkg`/`.ipa` packages for distribution.

https://github.com/user-attachments/assets/4e7d425c-7c9b-4e24-bcea-185cde36b049

## Features

- Automatically runs `xcrun safari-web-extension-converter` to convert the extension to an Xcode project
- Updates Xcode project configuration (version number, app category, development team, etc.)
- Updates all Info.plist files
- **Automated Packaging (`buildPackage: true`)**: Archives and exports `.pkg` (macOS) or `.ipa` (iOS) distribution binaries using `xcodebuild`, ready for publishing via `publish-browser-extension` / App Store Connect.

## Usage

### 1. Enable the module in wxt.config.ts

```typescript
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['wxt-module-safari-xcode'],
  safariXcode: {
    projectName: 'Your Project Name',
    appCategory: 'public.app-category.productivity',
    bundleIdentifier: 'com.example.your-extension',
    developmentTeam: 'ABC1234567',
    buildPackage: true, // Automatically archive & export .pkg/.ipa
  },
  // ... other configurations
})
```

### 2. Build Safari Extension

```bash
pnpm wxt build -b safari
```

The module will automatically convert the extension to an Xcode project after the build completes, and (if `buildPackage: true`) export `.output/<projectName>.pkg`.

## Configuration Options

| Option               | Type                          | Required | Description                                                                                   |
| -------------------- | ----------------------------- | :------: | --------------------------------------------------------------------------------------------- |
| `projectName`        | `string`                      | ❌       | Safari project name. Falls back to `manifest.name`, then to the `name` field in `package.json` |
| `appCategory`        | `string`                      | ✅       | App category, e.g., `'public.app-category.productivity'`                                      |
| `bundleIdentifier`   | `string`                      | ✅       | Bundle identifier, e.g., `'com.example.app'`                                                  |
| `developmentTeam`    | `string`                      | ❌       | Apple Developer Team ID, e.g., `'ABC1234567'`. If not provided, must be set manually in Xcode |
| `outputPath`         | `string`                      | ❌       | Custom output path for the Xcode project. Defaults to `.output/<projectName>`                 |
| `projectType`        | `string`                      | ❌       | Project type: `'macos'`, `'ios'`, or `'both'`. Defaults to `'both'`                           |
| `openProject`        | `boolean`                     | ❌       | Whether to open the Xcode project after conversion. Defaults to `true`                        |
| `buildPackage`       | `boolean`                     | ❌       | Automatically archive & export `.pkg`/`.ipa` package using `xcodebuild`. Defaults to `false`   |
| `scheme`             | `string`                      | ❌       | Custom scheme name for `xcodebuild`. Defaults to `${projectName} (macOS)` or `${projectName} (iOS)` |
| `exportOptionsPlist` | `string \| Record<string,any>` | ❌       | Path to `ExportOptions.plist` or inline object for `xcodebuild -exportArchive`                |

## How It Works

This module uses WXT's [`build:done`](https://wxt.dev/api/reference/wxt/interfaces/WxtHooks.html#build-done) hook to perform the following steps after the build completes:

1. Run `xcrun safari-web-extension-converter` to convert the extension to a Safari Xcode project
2. Read the version number from `package.json`
3. Update the Xcode project configuration file (`.xcodeproj/project.pbxproj`)
   - Set `MARKETING_VERSION` to the version from package.json
   - Set `CURRENT_PROJECT_VERSION` to numeric version (major * 10000 + minor * 100 + patch)
   - Configure app category
   - Configure development team (if provided)
4. Update all Info.plist files and add `CFBundleVersion`
5. *(Optional, if `buildPackage: true`)* Run `xcodebuild archive` and `xcodebuild -exportArchive` to produce a `.pkg` / `.ipa` installer binary ready for `publish-browser-extension`

## Building & Publishing with publish-browser-extension

When `buildPackage: true` is enabled, the module outputs a signed `.pkg` installer to `.output/<projectName>.pkg`. You can publish it directly to App Store Connect using `publish-browser-extension`:

```bash
publish-extension --safari-bundle-path ".output/My Project.pkg" \
  --safari-api-key-id "YOUR_KEY_ID" \
  --safari-api-issuer-id "YOUR_ISSUER_ID" \
  --safari-api-private-key-path "./AuthKey_YOUR_KEY_ID.p8"
```

## Notes

- This module only executes when building for Safari browser (`wxt build -b safari`)
- Supports both MV2 and MV3 Safari builds (the build target is detected from `wxt.config.manifestVersion`)
- Requires macOS and Xcode Command Line Tools
- If you want to read configuration from environment variables, ensure `.env.local` is added to `.gitignore`

## Examples

### Complete Configuration Example (with Packaging)

```typescript
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-react', 'wxt-module-safari-xcode'],
  safariXcode: {
    projectName: 'My Awesome Extension',
    appCategory: 'public.app-category.productivity',
    bundleIdentifier: 'com.mycompany.awesome-extension',
    developmentTeam: 'ABC1234567',
    buildPackage: true, // Automatically produce .pkg installer
  },
  manifest: {
    name: 'My Awesome Extension',
    version: '0.1.0',
  },
})
```

Generated Xcode project will be located at: `.output/<projectName>/<projectName>.xcodeproj`  
Generated `.pkg` package will be located at: `.output/<projectName>.pkg`

