/**
 * Config Loader
 * Configuration file loading utilities
 */

const fs = require('fs')
const path = require('path')

/**
 * Load configuration from JSON file
 * @param {string} configPath - Path to config file
 * @returns {Object} Configuration object
 */
function loadConfig (configPath = '../config/default.json') {
  try {
    const fullPath = path.resolve(__dirname, configPath)
    if (fs.existsSync(fullPath)) {
      const configData = fs.readFileSync(fullPath, 'utf8')
      return JSON.parse(configData)
    } else {
      return {}
    }
  } catch (error) {
    console.warn('Failed to load config:', error.message)
    return {}
  }
}

module.exports = { loadConfig }