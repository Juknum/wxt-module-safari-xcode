import 'wxt'
import fs from 'node:fs/promises'
import { defineWxtModule } from 'wxt/modules'
import { $ } from 'zx'
import { updateInfoPlist, updateProjectConfig, createExportOptionsPlist } from './safari-utils'

export interface SafariXcodeOptions {
  /**
   * Safari project name
   * Defaults to manifest.name if not provided
   */
  projectName?: string
  /**
   * App category, e.g., 'public.app-category.productivity'
   */
  appCategory: string
  /**
   * Bundle identifier
   */
  bundleIdentifier: string
  /**
   * Apple Developer Team ID (optional)
   * Example: 'ABC1234567'
   * If not provided, the generated Xcode project will need to have the development team set manually
   */
  developmentTeam?: string
  /**
   * Output path for the Xcode project
   * Defaults to '.output/{projectName}/' directory
   */
  outputPath?: string
  /**
   * Project type
   * Defaults to "both" (MacOS and iOS)
   */
  projectType?: 'macos' | 'ios' | 'both'
  /**
   * Open the Xcode project after creation
   * Defaults to true, you may want to set this to false in CI environments
   */
  openProject?: boolean
  /**
   * Automatically archive and export a .pkg or .ipa package using xcodebuild.
   * Required for direct publishing with publish-browser-extension / wxt submit.
   * Defaults to false.
   */
  buildPackage?: boolean
  /**
   * Custom scheme name for xcodebuild.
   * Defaults to `${projectName} (macOS)` for macos projectType, or `${projectName} (iOS)` for ios.
   */
  scheme?: string
  /**
   * Custom exportOptions.plist path, or inline options object.
   * If not provided, a default ExportOptions.plist with method 'app-store' and automatic signing will be generated.
   */
  exportOptionsPlist?: string | Record<string, any>
}

export default defineWxtModule<SafariXcodeOptions>({
  name: 'safari-xcode',
  configKey: 'safariXcode',
  async setup(wxt, options) {
    // Only execute when building for Safari
    if (wxt.config.browser !== 'safari') {
      return
    }

    const { appCategory, bundleIdentifier, developmentTeam } = options ?? {}

    // Use manifest.name as default projectName
    const projectName = options?.projectName 
      ?? wxt.config.manifest.name 
      ?? await fs.readFile(`${wxt.config.root}/package.json`, 'utf-8').then((data) => JSON.parse(data).name)

    if (!projectName || !appCategory || !bundleIdentifier) {
      wxt.logger.warn(
        'Safari Xcode module is not configured properly. Please provide projectName, appCategory and bundleIdentifier.',
      )
      return
    }

    const packageJsonRaw = await fs.readFile(`${wxt.config.root}/package.json`, 'utf-8')
    if (!JSON.parse(packageJsonRaw).version) {
      throw new Error(
        'Safari Xcode module: package.json is missing a "version" field. Add a version (e.g. "0.1.0") so the Xcode project can be configured.',
      )
    }

    const outputPath  = options?.outputPath  ?? `.output/${projectName}`
    const projectType = options?.projectType ?? 'both'
    const openProject = options?.openProject ?? true

    wxt.hook('build:done', async (wxt) => {
      wxt.logger.info(`Converting ${highlight('Safari extension')} to ${highlight('Xcode project')}...`)

      if (process.platform !== 'darwin') {
        const error = new Error('Safari Xcode conversion requires macOS.')
        wxt.logger.error('Safari Xcode conversion is only supported on macOS.', error)
        throw error
      }

      try {
        // Run safari-web-extension-converter
        wxt.logger.info(`Running ${highlight('safari-web-extension-converter')}...`)

        const flags = ['--force', '--no-prompt'];

        if (projectType === 'ios')   flags.push('--ios-only');
        if (projectType === 'macos') flags.push('--macos-only');
        
        if (!openProject) flags.push('--no-open');

        await $`xcrun safari-web-extension-converter --bundle-identifier ${bundleIdentifier} --project-location .output ${flags} .output/safari-mv${wxt.config.manifestVersion}`

        // Move to custom output path if needed
        if (outputPath !== `.output/${projectName}`) {
          await $`mv .output/${projectName} ${outputPath}`
        }

        // Update project configuration
        wxt.logger.info(`Updating ${highlight('Xcode project config')}...`)
        await updateProjectConfig({
          projectName,
          outputPath,
          appCategory,
          bundleIdentifier,
          developmentTeam,
          rootPath: wxt.config.root,
        })

        // Update Info.plist
        wxt.logger.info(`Updating ${highlight('Info.plist files')}...`)
        await updateInfoPlist({
          projectName,
          outputPath,
          appCategory,
          bundleIdentifier,
          developmentTeam,
          rootPath: wxt.config.root,
        })

        if (options?.buildPackage) {
          wxt.logger.info(`Archiving and exporting ${highlight('Safari package')} with ${highlight('xcodebuild')}...`)
          const scheme = options.scheme ?? (projectType === 'ios' ? `${projectName} (iOS)` : `${projectName} (macOS)`)
          const archivePath = `.output/${projectName}.xcarchive`

          // 1. xcodebuild archive
          wxt.logger.info(`Archiving scheme ${highlight(scheme)}...`)
          await $`xcodebuild archive -project ${outputPath}/${projectName}.xcodeproj -scheme ${scheme} -archivePath ${archivePath}`

          // 2. Prepare ExportOptions.plist
          let plistPath: string
          if (typeof options.exportOptionsPlist === 'string') {
            plistPath = options.exportOptionsPlist
          } else {
            plistPath = `.output/ExportOptions.plist`
            await createExportOptionsPlist(plistPath, {
              teamID: developmentTeam,
              customOptions: typeof options.exportOptionsPlist === 'object' ? options.exportOptionsPlist : undefined,
            })
          }

          // 3. xcodebuild -exportArchive
          wxt.logger.info(`Exporting package to ${highlight('.output/')}...`)
          await $`xcodebuild -exportArchive -archivePath ${archivePath} -exportOptionsPlist ${plistPath} -exportPath .output/`

          wxt.logger.success('Safari package created successfully!')
        }

        wxt.logger.success('Safari Xcode project created successfully!')
      } catch (error) {
        wxt.logger.error('Safari Xcode conversion failed:', error)
        throw error
      }
    })
  },
})

declare module 'wxt' {
  export interface InlineConfig {
    safariXcode?: SafariXcodeOptions
  }
}

function highlight(text: string): string {
  return `\x1b[36m${text}\x1b[0m`
}
