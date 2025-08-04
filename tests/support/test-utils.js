/**
 * Test utility functions
 * Common helpers for integration tests
 */

const net = require('net')

/**
 * Find an available port starting from a base port
 * @param {number} basePort - Starting port to check
 * @returns {Promise<number>} Available port number
 */
async function findAvailablePort (basePort = 3000) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

/**
 * Wait for a server to be ready
 * @param {string} url - URL to check
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>} True if server is ready
 */
async function waitForServer (url, timeout = 10000) {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url)
      if (response.status < 500) {
        return true
      }
    } catch (error) {
      // Server not ready yet, continue waiting
    }

    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return false
}

module.exports = {
  findAvailablePort,
  waitForServer
}
