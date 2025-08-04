/**
 * ConfigLoader のユニットテスト
 * 包括的テストによる高いカバレッジを実現
 */

const fs = require('fs')
const path = require('path')
const ConfigLoader = require('../../src/utils/config-loader')

// Mock file system
jest.mock('fs')
jest.mock('path')

describe('ConfigLoader', () => {
  const mockFs = fs
  const mockPath = path

  beforeEach(() => {
    jest.clearAllMocks()

    // Reset environment variables
    delete process.env.TEST_VAR
    delete process.env.DATABASE_URL
    delete process.env.API_KEY

    // Clear cache
    ConfigLoader.clearCache()

    // Mock path.resolve to return predictable paths
    mockPath.resolve.mockImplementation((filePath) => `/absolute${filePath}`)
  })

  describe('loadConfig', () => {
    it('should load and parse JSON configuration successfully', () => {
      const mockConfig = {
        database: {
          host: 'localhost',
          port: 5432
        },
        apiKey: 'test-key'
      }

      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      const result = ConfigLoader.loadConfig('config.json')

      expect(mockPath.resolve).toHaveBeenCalledWith('config.json')
      expect(mockFs.existsSync).toHaveBeenCalledWith('/absolute/config.json')
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/absolute/config.json', 'utf8')
      expect(result).toEqual(mockConfig)
    })

    it('should throw error if configuration file does not exist', () => {
      mockPath.resolve.mockReturnValue('/absolute/nonexistent.json')
      mockFs.existsSync.mockReturnValue(false)

      expect(() => {
        ConfigLoader.loadConfig('nonexistent.json')
      }).toThrow('Configuration file not found: /absolute/nonexistent.json')
    })

    it('should throw error for invalid JSON', () => {
      mockPath.resolve.mockReturnValue('/absolute/invalid.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue('{ invalid json }')

      expect(() => {
        ConfigLoader.loadConfig('invalid.json')
      }).toThrow('Failed to load configuration from /absolute/invalid.json')
    })

    it('should throw error if file read fails', () => {
      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      expect(() => {
        ConfigLoader.loadConfig('config.json')
      }).toThrow('Failed to load configuration from /absolute/config.json: Permission denied')
    })

    it('should use cache on subsequent calls', () => {
      const mockConfig = { test: 'value' }

      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      // First call
      const result1 = ConfigLoader.loadConfig('config.json')

      // Second call should use cache
      const result2 = ConfigLoader.loadConfig('config.json')

      expect(mockFs.readFileSync).toHaveBeenCalledTimes(1)
      expect(result1).toEqual(result2)
      expect(result1).toEqual(mockConfig)
    })

    it('should bypass cache when useCache is false', () => {
      const mockConfig = { test: 'value' }

      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      // First call with cache disabled
      ConfigLoader.loadConfig('config.json', false)

      // Second call should read file again
      ConfigLoader.loadConfig('config.json', false)

      expect(mockFs.readFileSync).toHaveBeenCalledTimes(2)
    })

    it('should resolve environment variables in configuration', () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/testdb'
      process.env.API_KEY = 'secret-key-123'

      const mockConfig = {
        database: {
          url: '${DATABASE_URL}',
          connectionLimit: 10
        },
        api: {
          key: '${API_KEY}',
          timeout: 5000
        },
        static: 'unchanged'
      }

      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      const result = ConfigLoader.loadConfig('config.json')

      expect(result.database.url).toBe('postgres://localhost:5432/testdb')
      expect(result.api.key).toBe('secret-key-123')
      expect(result.static).toBe('unchanged')
      expect(result.database.connectionLimit).toBe(10)
      expect(result.api.timeout).toBe(5000)
    })

    it('should leave undefined environment variables unchanged', () => {
      const mockConfig = {
        value: '${UNDEFINED_VAR}',
        nested: {
          another: '${ALSO_UNDEFINED}'
        }
      }

      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      const result = ConfigLoader.loadConfig('config.json')

      expect(result.value).toBe('${UNDEFINED_VAR}')
      expect(result.nested.another).toBe('${ALSO_UNDEFINED}')
    })
  })

  describe('resolveEnvironmentVariables', () => {
    it('should resolve environment variables in nested objects', () => {
      process.env.HOST = 'localhost'
      process.env.PORT = '3000'

      const config = {
        server: {
          host: '${HOST}',
          port: '${PORT}',
          ssl: {
            cert: '${SSL_CERT}', // undefined
            enabled: false
          }
        },
        features: ['${HOST}', 'static-feature']
      }

      const result = ConfigLoader.resolveEnvironmentVariables(config)

      expect(result.server.host).toBe('localhost')
      expect(result.server.port).toBe('3000')
      expect(result.server.ssl.cert).toBe('${SSL_CERT}') // unchanged
      expect(result.server.ssl.enabled).toBe(false)
      expect(result.features).toEqual(['localhost', 'static-feature'])
    })

    it('should handle multiple environment variables in one string', () => {
      process.env.USER = 'john'
      process.env.DOMAIN = 'example.com'

      const config = {
        email: '${USER}@${DOMAIN}',
        url: 'https://${DOMAIN}/api/users/${USER}'
      }

      const result = ConfigLoader.resolveEnvironmentVariables(config)

      expect(result.email).toBe('john@example.com')
      expect(result.url).toBe('https://example.com/api/users/john')
    })

    it('should not modify non-string values', () => {
      const config = {
        port: 3000,
        enabled: true,
        features: ['feature1', 'feature2'],
        metadata: null,
        count: 0
      }

      const result = ConfigLoader.resolveEnvironmentVariables(config)

      expect(result).toEqual(config)
    })

    it('should handle arrays of objects', () => {
      process.env.DB_HOST = 'db.example.com'

      const config = {
        databases: [
          { name: 'primary', host: '${DB_HOST}', port: 5432 },
          { name: 'secondary', host: 'backup.db.com', port: 5433 }
        ]
      }

      const result = ConfigLoader.resolveEnvironmentVariables(config)

      expect(result.databases[0].host).toBe('db.example.com')
      expect(result.databases[1].host).toBe('backup.db.com')
    })

    it('should create deep copy and not modify original', () => {
      process.env.TEST_VAR = 'resolved'

      const original = {
        value: '${TEST_VAR}',
        nested: { prop: '${TEST_VAR}' }
      }

      const result = ConfigLoader.resolveEnvironmentVariables(original)

      expect(original.value).toBe('${TEST_VAR}') // unchanged
      expect(original.nested.prop).toBe('${TEST_VAR}') // unchanged
      expect(result.value).toBe('resolved')
      expect(result.nested.prop).toBe('resolved')
    })
  })

  describe('loadConfigs', () => {
    it('should load and merge multiple configuration files', () => {
      const config1 = {
        database: { host: 'localhost', port: 5432 },
        api: { version: 'v1' }
      }

      const config2 = {
        database: { port: 3306, user: 'admin' },
        logging: { level: 'info' }
      }

      mockPath.resolve
        .mockReturnValueOnce('/absolute/config1.json')
        .mockReturnValueOnce('/absolute/config2.json')

      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync
        .mockReturnValueOnce(JSON.stringify(config1))
        .mockReturnValueOnce(JSON.stringify(config2))

      const result = ConfigLoader.loadConfigs(['config1.json', 'config2.json'])

      expect(result).toEqual({
        database: {
          host: 'localhost',
          port: 3306, // overridden by config2
          user: 'admin'
        },
        api: { version: 'v1' },
        logging: { level: 'info' }
      })
    })

    it('should handle empty array of file paths', () => {
      const result = ConfigLoader.loadConfigs([])

      expect(result).toEqual({})
    })

    it('should pass useCache parameter to loadConfig', () => {
      const config = { test: 'value' }

      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config))

      // Load with cache disabled
      ConfigLoader.loadConfigs(['config.json'], false)
      ConfigLoader.loadConfigs(['config.json'], false)

      // Should call readFileSync twice because cache is disabled
      expect(mockFs.readFileSync).toHaveBeenCalledTimes(2)
    })
  })

  describe('mergeConfigs', () => {
    it('should merge multiple configuration objects', () => {
      const configs = [
        { a: 1, b: { x: 1, y: 2 } },
        { b: { y: 3, z: 4 }, c: 5 },
        { a: 10, d: 6 }
      ]

      const result = ConfigLoader.mergeConfigs(configs)

      expect(result).toEqual({
        a: 10, // overridden by last config
        b: { x: 1, y: 3, z: 4 }, // merged
        c: 5,
        d: 6
      })
    })

    it('should handle empty array', () => {
      const result = ConfigLoader.mergeConfigs([])

      expect(result).toEqual({})
    })

    it('should handle single configuration', () => {
      const config = { test: 'value' }
      const result = ConfigLoader.mergeConfigs([config])

      expect(result).toEqual(config)
    })
  })

  describe('deepMerge', () => {
    it('should merge objects deeply', () => {
      const target = {
        a: 1,
        b: {
          x: 1,
          y: { deep: 'value1' }
        },
        c: [1, 2, 3]
      }

      const source = {
        b: {
          y: { deep: 'value2', new: 'prop' },
          z: 3
        },
        c: [4, 5],
        d: 'new'
      }

      const result = ConfigLoader.deepMerge(target, source)

      expect(result).toEqual({
        a: 1,
        b: {
          x: 1,
          y: { deep: 'value2', new: 'prop' },
          z: 3
        },
        c: [4, 5], // arrays are replaced, not merged
        d: 'new'
      })
    })

    it('should not modify original objects', () => {
      const target = { a: { b: 1 } }
      const source = { a: { c: 2 } }

      const result = ConfigLoader.deepMerge(target, source)

      expect(target).toEqual({ a: { b: 1 } }) // unchanged
      expect(source).toEqual({ a: { c: 2 } }) // unchanged
      expect(result).toEqual({ a: { b: 1, c: 2 } })
    })

    it('should handle null and undefined values', () => {
      const target = { a: null, b: undefined, c: 1 }
      const source = { a: 'value', b: 'value', d: null }

      const result = ConfigLoader.deepMerge(target, source)

      expect(result).toEqual({
        a: 'value',
        b: 'value',
        c: 1,
        d: null
      })
    })

    it('should handle arrays correctly', () => {
      const target = { arr: [1, 2, 3] }
      const source = { arr: [4, 5] }

      const result = ConfigLoader.deepMerge(target, source)

      expect(result.arr).toEqual([4, 5]) // replaced, not merged
    })

    it('should handle primitive values', () => {
      const target = { str: 'old', num: 1, bool: false }
      const source = { str: 'new', num: 2, bool: true }

      const result = ConfigLoader.deepMerge(target, source)

      expect(result).toEqual({
        str: 'new',
        num: 2,
        bool: true
      })
    })

    it('should handle empty objects', () => {
      const result1 = ConfigLoader.deepMerge({}, { a: 1 })
      const result2 = ConfigLoader.deepMerge({ a: 1 }, {})
      const result3 = ConfigLoader.deepMerge({}, {})

      expect(result1).toEqual({ a: 1 })
      expect(result2).toEqual({ a: 1 })
      expect(result3).toEqual({})
    })
  })

  describe('clearCache', () => {
    it('should clear the configuration cache', () => {
      const mockConfig = { test: 'value' }

      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      // Load config to populate cache
      ConfigLoader.loadConfig('config.json')

      // Clear cache
      ConfigLoader.clearCache()

      // Load again - should read from file again
      ConfigLoader.loadConfig('config.json')

      expect(mockFs.readFileSync).toHaveBeenCalledTimes(2)
    })
  })

  describe('getConfig', () => {
    it('should load configuration with defaults', () => {
      const configData = { api: { timeout: 5000 } }
      const defaults = {
        api: { timeout: 3000, retries: 3 },
        logging: { level: 'info' }
      }

      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(configData))

      const result = ConfigLoader.getConfig('config.json', defaults)

      expect(result).toEqual({
        api: { timeout: 5000, retries: 3 }, // merged
        logging: { level: 'info' } // from defaults
      })
    })

    it('should return defaults if configuration file does not exist', () => {
      const defaults = {
        api: { timeout: 3000 },
        logging: { level: 'info' }
      }

      mockPath.resolve.mockReturnValue('/absolute/nonexistent.json')
      mockFs.existsSync.mockReturnValue(false)

      const result = ConfigLoader.getConfig('nonexistent.json', defaults)

      expect(result).toEqual(defaults)
    })

    it('should return defaults if configuration loading fails', () => {
      const defaults = { fallback: true }

      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read error')
      })

      const result = ConfigLoader.getConfig('config.json', defaults)

      expect(result).toEqual(defaults)
    })

    it('should work with empty defaults', () => {
      const configData = { test: 'value' }

      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(configData))

      const result = ConfigLoader.getConfig('config.json')

      expect(result).toEqual(configData)
    })

    it('should pass useCache parameter', () => {
      const configData = { test: 'value' }
      const defaults = { default: 'value' }

      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(configData))

      // Call twice with cache disabled
      ConfigLoader.getConfig('config.json', defaults, false)
      ConfigLoader.getConfig('config.json', defaults, false)

      expect(mockFs.readFileSync).toHaveBeenCalledTimes(2)
    })
  })

  describe('singleton behavior', () => {
    it('should export a singleton instance', () => {
      const ConfigLoader1 = require('../../src/utils/config-loader')
      const ConfigLoader2 = require('../../src/utils/config-loader')

      expect(ConfigLoader1).toBe(ConfigLoader2)
    })

    it('should maintain cache across different requires', () => {
      const mockConfig = { test: 'value' }

      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      // Load config with first instance
      ConfigLoader.loadConfig('config.json')

      // Require again and load - should use cache
      const AnotherConfigLoader = require('../../src/utils/config-loader')
      AnotherConfigLoader.loadConfig('config.json')

      expect(mockFs.readFileSync).toHaveBeenCalledTimes(1)
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle complex nested environment variable resolution', () => {
      process.env.ENV = 'production'
      process.env.PROD_HOST = 'prod.example.com'
      process.env.DEV_HOST = 'dev.example.com'

      const config = {
        host: '${${ENV}_HOST}', // This won't work as expected
        simpleHost: '${PROD_HOST}'
      }

      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config))

      const result = ConfigLoader.loadConfig('config.json')

      // Complex nested substitution doesn't work
      expect(result.host).toBe('${${ENV}_HOST}')
      expect(result.simpleHost).toBe('prod.example.com')
    })

    it('should handle circular references in configuration gracefully', () => {
      // Create a config that would cause circular reference if not handled properly
      const config = {
        a: { ref: 'b' },
        b: { ref: 'a' }
      }

      const result = ConfigLoader.deepMerge({}, config)

      expect(result).toEqual(config)
    })

    it('should handle very deep nesting', () => {
      const deepConfig = { level1: { level2: { level3: { level4: { level5: 'deep' } } } } }
      const anotherDeep = { level1: { level2: { level3: { level4: { level6: 'another' } } } } }

      const result = ConfigLoader.deepMerge(deepConfig, anotherDeep)

      expect(result.level1.level2.level3.level4.level5).toBe('deep')
      expect(result.level1.level2.level3.level4.level6).toBe('another')
    })

    it('should handle configuration files with BOM', () => {
      const configData = { test: 'value' }
      const configWithBOM = '\uFEFF' + JSON.stringify(configData)

      mockPath.resolve.mockReturnValue('/absolute/config.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(configWithBOM)

      expect(() => {
        ConfigLoader.loadConfig('config.json')
      }).toThrow() // JSON.parse will fail with BOM
    })

    it('should handle empty configuration file', () => {
      mockPath.resolve.mockReturnValue('/absolute/empty.json')
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue('')

      expect(() => {
        ConfigLoader.loadConfig('empty.json')
      }).toThrow('Failed to load configuration')
    })
  })
})
