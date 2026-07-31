import { globby } from 'zx'
import path from 'node:path'
import fs from 'node:fs/promises'

export interface SafariPostBuildOptions {
  projectName: string
  appCategory: string
  bundleIdentifier: string
  developmentTeam?: string
  outputPath: string
  rootPath: string
}

export async function updateProjectConfig(options: SafariPostBuildOptions) {
  const projectConfigPath = path.resolve(
    options.rootPath,
    `${options.outputPath}/${options.projectName}.xcodeproj/project.pbxproj`,
  )
  const packageJsonModule = await import(path.resolve(options.rootPath, 'package.json'), {
    with: { type: 'json' },
  })
  const packageJson = packageJsonModule.default as { version: string }
  const content = await fs.readFile(projectConfigPath, 'utf-8')
  const newContent = normaliseBundleIds(content, options.bundleIdentifier)
    .replaceAll(
      'MARKETING_VERSION = 1.0;',
      `MARKETING_VERSION = ${packageJson.version};`,
    )
    .replace(
      new RegExp(
        `INFOPLIST_KEY_CFBundleDisplayName = ("?${options.projectName}"?);`,
        'g',
      ),
      `INFOPLIST_KEY_CFBundleDisplayName = $1;\n\t\t\t\tINFOPLIST_KEY_LSApplicationCategoryType = "${options.appCategory}";`,
    )
    .replace(
      new RegExp(`GCC_WARN_UNUSED_VARIABLE = YES;`, 'g'),
      `GCC_WARN_UNUSED_VARIABLE = YES;\n\t\t\t\tINFOPLIST_KEY_LSApplicationCategoryType = "${options.appCategory}";`,
    )
    .replace(
      new RegExp(
        `INFOPLIST_KEY_CFBundleDisplayName = ("?${options.projectName}"?);`,
        'g',
      ),
      `INFOPLIST_KEY_CFBundleDisplayName = $1;\n\t\t\t\tINFOPLIST_KEY_ITSAppUsesNonExemptEncryption = NO;`,
    )
    .replaceAll(
      `COPY_PHASE_STRIP = NO;`,
      options.developmentTeam
        ? `COPY_PHASE_STRIP = NO;\n\t\t\t\tDEVELOPMENT_TEAM = ${options.developmentTeam};`
        : 'COPY_PHASE_STRIP = NO;',
    )
    .replace(
      /CURRENT_PROJECT_VERSION = \d+;/g,
      `CURRENT_PROJECT_VERSION = ${parseProjectVersion(packageJson.version)};`,
    )
  await fs.writeFile(projectConfigPath, newContent)
}

export async function updateInfoPlist(options: SafariPostBuildOptions) {
  const projectPath = path.resolve(options.rootPath, options.outputPath)
  const files = await globby('**/*.plist', {
    cwd: projectPath,
  })
  for (const file of files) {
    const content = await fs.readFile(path.resolve(projectPath, file), 'utf-8')
    await fs.writeFile(
      path.resolve(projectPath, file),
      content.replaceAll(
        '</dict>\n</plist>',
        '\t<key>CFBundleVersion</key>\n\t<string>$(CURRENT_PROJECT_VERSION)</string>\n</dict>\n</plist>',
      ),
    )
  }
}

function parseProjectVersion(version: string) {
  const [major, minor, patch] = version.split('.').map(Number)
  return major * 10000 + minor * 100 + patch
}

const BUNDLE_ID_REGEX = /PRODUCT_BUNDLE_IDENTIFIER = ("[^"]*"|[^;]+);/g

function unwrap(raw: string): string {
  return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw
}

function quote(value: string): string {
  // Xcode pbxproj only needs quotes when the value isn't a bare identifier
  // (letters, digits, dot, underscore, hyphen). Hyphens are bare-safe but
  // Apple often quotes them anyway — match that style by quoting whenever
  // the value isn't strictly bare-safe AND when it contains a hyphen.
  return /^[A-Za-z0-9._]+$/.test(value) ? value : `"${value}"`
}

/**
 * Normalise every PRODUCT_BUNDLE_IDENTIFIER so the parent app's id matches
 * the user-supplied bundleIdentifier and sub-targets share that prefix.
 *
 * Apple's `xcrun safari-web-extension-converter` sometimes mangles the
 * parent app's id (e.g. uppercasing the last segment to match the project
 * name) while leaving sub-target ids alone — or vice versa — depending on
 * Xcode version and which `--ios-only`/`--macos-only` flag was passed. The
 * resulting prefix mismatch makes Xcode refuse the build with "Embedded
 * binary's bundle identifier is not prefixed with the parent app's".
 *
 * Strategy: the shortest unique id in the pbxproj is the parent app's
 * (Apple-mangled) stem; sub-targets append a suffix to it. Replace that
 * stem everywhere with the user-supplied bundleIdentifier, preserving any
 * suffix (`.Extension`, ` Extension`, etc.).
 */
export function normaliseBundleIds(content: string, bundleIdentifier: string): string {
  const ids = [...content.matchAll(BUNDLE_ID_REGEX)].map((m) => unwrap(m[1]))
  if (ids.length === 0) return content

  const stem = [...new Set(ids)].sort((a, b) => a.length - b.length)[0]
  if (!stem || stem === bundleIdentifier) return content

  return content.replace(BUNDLE_ID_REGEX, (match, raw: string) => {
    const id = unwrap(raw)
    if (!id.startsWith(stem)) return match
    const newId = bundleIdentifier + id.slice(stem.length)
    return `PRODUCT_BUNDLE_IDENTIFIER = ${quote(newId)};`
  })
}

export interface CreateExportOptionsPlistOptions {
  method?: string
  signingStyle?: string
  teamID?: string
  customOptions?: Record<string, any>
}

export async function createExportOptionsPlist(
  filePath: string,
  options: CreateExportOptionsPlistOptions,
) {
  const method = options.customOptions?.method ?? options.method ?? 'app-store'
  const signingStyle = options.customOptions?.signingStyle ?? options.signingStyle ?? 'automatic'
  const teamID = options.customOptions?.teamID ?? options.teamID

  const entries: string[] = [
    `\t<key>method</key>\n\t<string>${method}</string>`,
    `\t<key>signingStyle</key>\n\t<string>${signingStyle}</string>`,
  ]

  if (teamID) {
    entries.push(`\t<key>teamID</key>\n\t<string>${teamID}</string>`)
  }

  if (options.customOptions) {
    for (const [key, value] of Object.entries(options.customOptions)) {
      if (['method', 'signingStyle', 'teamID'].includes(key)) continue
      if (typeof value === 'boolean') {
        entries.push(`\t<key>${key}</key>\n\t<${value}/>`)
      } else if (typeof value === 'string') {
        entries.push(`\t<key>${key}</key>\n\t<string>${value}</string>`)
      }
    }
  }

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${entries.join('\n')}
</dict>
</plist>
`
  await fs.writeFile(filePath, content, 'utf-8')
}

export async function normalizeConvertedProject(
  outputLocation: string,
  targetProjectName: string,
  manifestVersion: number,
) {
  const targetDirPath = path.resolve(outputLocation, targetProjectName)

  // 1. Check if targetDirPath already has a .xcodeproj
  if (await fs.stat(targetDirPath).then((s) => s.isDirectory()).catch(() => false)) {
    const files = await fs.readdir(targetDirPath).catch(() => [])
    const proj = files.find((f) => f.endsWith('.xcodeproj'))
    if (proj) {
      if (proj !== `${targetProjectName}.xcodeproj`) {
        await fs.rename(
          path.join(targetDirPath, proj),
          path.join(targetDirPath, `${targetProjectName}.xcodeproj`),
        )
      }
      return
    }
  }

  // 2. Search all directories under outputLocation for a .xcodeproj
  const entries = await fs.readdir(outputLocation, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirPath = path.join(outputLocation, entry.name)
    const files = await fs.readdir(dirPath).catch(() => [])
    const proj = files.find((f) => f.endsWith('.xcodeproj'))
    if (!proj) continue

    const currentProjName = path.basename(proj, '.xcodeproj')

    // If Apple converter put the xcode project directly inside safari-mv2/safari-mv3 build dir:
    if (entry.name === `safari-mv${manifestVersion}`) {
      await fs.mkdir(targetDirPath, { recursive: true })
      const xcodeItems = files.filter(
        (f) =>
          f.endsWith('.xcodeproj') ||
          f.includes('(App)') ||
          f.includes('(Extension)') ||
          f.endsWith('.xcworkspace'),
      )
      for (const item of xcodeItems) {
        const dest = item.endsWith('.xcodeproj') ? `${targetProjectName}.xcodeproj` : item
        await fs.rename(path.join(dirPath, item), path.join(targetDirPath, dest))
      }
      return
    }

    // If Apple converter created a separate directory (e.g. .output/OldName)
    if (entry.name !== targetProjectName) {
      await fs.rename(dirPath, targetDirPath)
    }
    if (currentProjName !== targetProjectName) {
      const oldProjPath = path.join(targetDirPath, `${currentProjName}.xcodeproj`)
      const newProjPath = path.join(targetDirPath, `${targetProjectName}.xcodeproj`)
      if (await fs.stat(oldProjPath).then(() => true).catch(() => false)) {
        await fs.rename(oldProjPath, newProjPath)
      }
    }
    return
  }
}


