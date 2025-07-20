/**
 * Configuration Loader Utility
 * 
 * Loads and manages configuration files with environment variable substitution
 */

const fs = require('fs')
const path = require('path')

class ConfigLoader {
  constructor () {
    this.cache = new Map()
  }

  /**
   * Load configuration from file
   */
  loadConfig (filePath, useCache = true) {
    const absolutePath = path.resolve(filePath)

    // Return cached config if available
    if (useCache && this.cache.has(absolutePath)) {
      return this.cache.get(absolutePath)
    }

    try {
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Configuration file not found: ${absolutePath}`)
      }

      const configContent = fs.readFileSync(absolutePath, 'utf8')
      const config = JSON.parse(configContent)

      // Resolve environment variables
      const resolvedConfig = this.resolveEnvironmentVariables(config)

      // Cache the resolved config
      if (useCache) {
        this.cache.set(absolutePath, resolvedConfig)
      }

      return resolvedConfig
    } catch (error) {
      throw new Error(`Failed to load configuration from ${absolutePath}: ${error.message}`)
    }
  }

  /**
   * Resolve environment variables in configuration
   */
  resolveEnvironmentVariables (config) {
    const resolved = JSON.parse(JSON.stringify(config)) // Deep copy

    const replaceEnvVars = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          // ${ENV_VAR} pattern replacement
          obj[key] = obj[key].replace(/\$\{([^}]+)\}/g, (match, envVar) => {
            const envValue = process.env[envVar]
            return envValue !== undefined ? envValue : match
          })
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          replaceEnvVars(obj[key])
        }
      }
    }

    replaceEnvVars(resolved)
    return resolved
  }

  /**
   * Load multiple configuration files and merge them
   */
  loadConfigs (filePaths, useCache = true) {
    const configs = filePaths.map(filePath => this.loadConfig(filePath, useCache))
    return this.mergeConfigs(configs)
  }

  /**
   * Merge multiple configuration objects
   */
  mergeConfigs (configs) {
    return configs.reduce((merged, config) => {
      return this.deepMerge(merged, config)
    }, {})
  }

  /**
   * Deep merge two objects
   */
  deepMerge (target, source) {
    const result = { ...target }

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key])
      } else {
        result[key] = source[key]
      }
    }

    return result
  }

  /**
   * Clear configuration cache
   */
  clearCache () {
    this.cache.clear()
  }

  /**
   * Get configuration with defaults
   */
  getConfig (filePath, defaults = {}, useCache = true) {
    try {
      const config = this.loadConfig(filePath, useCache)
      return this.deepMerge(defaults, config)
    } catch (error) {
      // Return defaults if config file doesn't exist
      return defaults
    }
  }
}

// Export singleton instance
module.exports = new ConfigLoader()