const fs = require('fs').promises
const path = require('path')
const archiver = require('archiver')
const logger = require('../utils/logger').default
const config = require('../../config/production.json')

class BackupService {
  constructor () {
    this.config = config.backup
    this.backupDir = path.join(process.cwd(), 'backups')
  }

  async initialize () {
    await fs.mkdir(this.backupDir, { recursive: true })
    logger.info('Backup service initialized')
  }

  async createBackup () {
    if (!this.config.enabled) {
      logger.info('Backup service disabled')
      return
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupName = `backup-${timestamp}.tar.gz`
    const backupPath = path.join(this.backupDir, backupName)

    try {
      logger.info(`Creating backup: ${backupName}`)

      const archive = archiver('tar', {
        gzip: true,
        gzipOptions: {
          level: 6
        }
      })

      const output = require('fs').createWriteStream(backupPath)

      return new Promise((resolve, reject) => {
        output.on('close', () => {
          logger.info(`Backup created: ${backupName} (${archive.pointer()} bytes)`)
          this.cleanupOldBackups()
          resolve(backupPath)
        })

        output.on('error', reject)
        archive.on('error', reject)

        archive.pipe(output)

        this.addToArchive(archive)
        archive.finalize()
      })
    } catch (error) {
      logger.error('Backup creation failed:', error)
      throw error
    }
  }

  addToArchive (archive) {
    const backupSources = [
      { source: 'config/', dest: 'config/' },
      { source: 'workflows/', dest: 'workflows/' },
      { source: 'cache/', dest: 'cache/' },
      { source: 'logs/', dest: 'logs/' },
      { source: 'package.json', dest: 'package.json' },
      { source: 'docker-compose.yml', dest: 'docker-compose.yml' }
    ]

    backupSources.forEach(({ source, dest }) => {
      const sourcePath = path.join(process.cwd(), source)

      try {
        const stats = require('fs').statSync(sourcePath)

        if (stats.isDirectory()) {
          archive.directory(sourcePath, dest)
        } else {
          archive.file(sourcePath, { name: dest })
        }

        logger.debug(`Added to backup: ${source}`)
      } catch (error) {
        logger.warn(`Failed to add to backup: ${source}`, error)
      }
    })
  }

  async cleanupOldBackups () {
    try {
      const files = await fs.readdir(this.backupDir)
      const backupFiles = files.filter(file => file.startsWith('backup-') && file.endsWith('.tar.gz'))

      if (backupFiles.length <= this.config.retention.daily) {
        return
      }

      const sortedFiles = backupFiles
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          mtime: require('fs').statSync(path.join(this.backupDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime)

      const filesToDelete = sortedFiles.slice(this.config.retention.daily)

      for (const file of filesToDelete) {
        await fs.unlink(file.path)
        logger.info(`Deleted old backup: ${file.name}`)
      }
    } catch (error) {
      logger.error('Backup cleanup failed:', error)
    }
  }

  async listBackups () {
    try {
      const files = await fs.readdir(this.backupDir)
      const backupFiles = files.filter(file => file.startsWith('backup-') && file.endsWith('.tar.gz'))

      const backups = await Promise.all(
        backupFiles.map(async (file) => {
          const filePath = path.join(this.backupDir, file)
          const stats = await fs.stat(filePath)

          return {
            name: file,
            path: filePath,
            size: stats.size,
            created: stats.mtime,
            age: Date.now() - stats.mtime.getTime()
          }
        })
      )

      return backups.sort((a, b) => b.created - a.created)
    } catch (error) {
      logger.error('Failed to list backups:', error)
      return []
    }
  }

  async restoreBackup (backupName) {
    const backupPath = path.join(this.backupDir, backupName)

    try {
      const stats = await fs.stat(backupPath)
      if (!stats.isFile()) {
        throw new Error('Backup file not found')
      }

      logger.info(`Restoring backup: ${backupName}`)

      const extract = require('tar')
      const restoreDir = path.join(process.cwd(), 'restore-temp')

      await fs.mkdir(restoreDir, { recursive: true })

      await extract.extract({
        file: backupPath,
        cwd: restoreDir
      })

      await this.copyRestoredFiles(restoreDir)

      await fs.rm(restoreDir, { recursive: true, force: true })

      logger.info(`Backup restored successfully: ${backupName}`)

      return true
    } catch (error) {
      logger.error('Backup restore failed:', error)
      throw error
    }
  }

  async copyRestoredFiles (restoreDir) {
    const filesToRestore = [
      'config/',
      'workflows/',
      'cache/',
      'package.json',
      'docker-compose.yml'
    ]

    for (const file of filesToRestore) {
      const sourcePath = path.join(restoreDir, file)
      const destPath = path.join(process.cwd(), file)

      try {
        const stats = await fs.stat(sourcePath)

        if (stats.isDirectory()) {
          await this.copyDirectory(sourcePath, destPath)
        } else {
          await fs.copyFile(sourcePath, destPath)
        }

        logger.debug(`Restored: ${file}`)
      } catch (error) {
        logger.warn(`Failed to restore: ${file}`, error)
      }
    }
  }

  async copyDirectory (source, dest) {
    await fs.mkdir(dest, { recursive: true })

    const files = await fs.readdir(source)

    for (const file of files) {
      const sourcePath = path.join(source, file)
      const destPath = path.join(dest, file)

      const stats = await fs.stat(sourcePath)

      if (stats.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath)
      } else {
        await fs.copyFile(sourcePath, destPath)
      }
    }
  }

  async deleteBackup (backupName) {
    const backupPath = path.join(this.backupDir, backupName)

    try {
      await fs.unlink(backupPath)
      logger.info(`Deleted backup: ${backupName}`)
      return true
    } catch (error) {
      logger.error('Failed to delete backup:', error)
      throw error
    }
  }

  async getBackupInfo (backupName) {
    const backupPath = path.join(this.backupDir, backupName)

    try {
      const stats = await fs.stat(backupPath)

      return {
        name: backupName,
        path: backupPath,
        size: stats.size,
        created: stats.mtime,
        age: Date.now() - stats.mtime.getTime(),
        sizeFormatted: this.formatBytes(stats.size)
      }
    } catch (error) {
      logger.error('Failed to get backup info:', error)
      throw error
    }
  }

  formatBytes (bytes) {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  async createScheduledBackup () {
    try {
      const backupPath = await this.createBackup()

      logger.info('Scheduled backup completed successfully')

      return {
        success: true,
        path: backupPath,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      logger.error('Scheduled backup failed:', error)

      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }
}

module.exports = new BackupService()
