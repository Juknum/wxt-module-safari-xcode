import { defineConfig } from 'wxt'

// Driven by env vars so the regression suite can sweep scenarios:
//   DEMO_NO_MANIFEST_NAME=1     -> drop manifest.name, exercise package.json fallback
//   DEMO_OUTPUT_PATH=...        -> exercise custom outputPath
//   DEMO_PROJECT_TYPE=ios|macos -> exercise --ios-only / --macos-only flags
const useManifestName = process.env.DEMO_NO_MANIFEST_NAME !== '1'
const outputPath = process.env.DEMO_OUTPUT_PATH
const projectType = (process.env.DEMO_PROJECT_TYPE as 'macos' | 'ios' | 'both' | undefined) ?? 'both'
const buildPackage = process.env.DEMO_BUILD_PACKAGE === '1'

export default defineConfig({
  modules: ['wxt-module-safari-xcode'],
  manifest: useManifestName ? { name: 'Safari Demo' } : {},
  safariXcode: {
    appCategory: 'public.app-category.productivity',
    bundleIdentifier: 'com.example.safari-demo',
    openProject: false,
    projectType,
    buildPackage,
    ...(outputPath ? { outputPath } : {}),
  },
})

