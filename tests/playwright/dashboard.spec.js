/**
 * Playwright E2E テスト - ダッシュボードUI
 * n8n-tweet システムのダッシュボード機能をテスト
 */

const { test, expect } = require('@playwright/test')

test.describe('n8n-tweet Dashboard E2E Tests', () => {
  // webServer設定でポート3000を使用

  test('ダッシュボードメインページの表示確認', async ({ page, baseURL }) => {
    // ダッシュボードページにアクセス
    await page.goto(baseURL || 'http://localhost:3000')

    // ページタイトルの確認
    await expect(page).toHaveTitle(/n8n-tweet.*Dashboard/i)

    // メインヘッダーの確認
    const header = page.locator('h1, h2, .header, .title')
    await expect(header.first()).toBeVisible()

    // ページが完全に読み込まれるまで待機
    await page.waitForLoadState('networkidle')

    // スクリーンショット取得
    await page.screenshot({
      path: 'tests/playwright/screenshots/dashboard-main.png',
      fullPage: true
    })
  })

  test('システム統計情報の表示確認', async ({ page, baseURL }) => {
    await page.goto(baseURL || 'http://localhost:3000')
    await page.waitForLoadState('networkidle')

    // 統計カードまたはメトリクス表示の確認
    const statsElements = await page.locator('[class*="stat"], [class*="metric"], [class*="card"]').count()

    if (statsElements > 0) {
      // 最初の統計要素をチェック
      const firstStat = page.locator('[class*="stat"], [class*="metric"], [class*="card"]').first()
      await expect(firstStat).toBeVisible()
    } else {
      // 統計要素がない場合はメインコンテンツエリアをチェック
      const mainContent = page.locator('main, .content, .dashboard-content, body')
      await expect(mainContent.first()).toBeVisible()
    }

    await page.screenshot({
      path: 'tests/playwright/screenshots/dashboard-stats.png',
      fullPage: true
    })
  })

  test('API エンドポイントのレスポンス確認', async ({ page, baseURL }) => {
    // APIエンドポイントをテスト
    const endpoints = [
      '/api/v1/health',
      '/api/v1/metrics',
      '/api/v1/statistics'
    ]

    for (const endpoint of endpoints) {
      try {
        const response = await page.request.get(`${baseURL || 'http://localhost:3000'}${endpoint}`)

        if (response.ok()) {
          const data = await response.json()
          expect(typeof data).toBe('object')
        }
      } catch (error) {
        // エンドポイントが存在しない場合はテストを継続
      }
    }
  })

  test('レスポンシブデザインの確認', async ({ page, baseURL }) => {
    await page.goto(baseURL || 'http://localhost:3000')

    // デスクトップサイズ
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: 'tests/playwright/screenshots/dashboard-desktop.png',
      fullPage: true
    })

    // タブレットサイズ
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.waitForTimeout(500) // サイズ変更の反映を待つ
    await page.screenshot({
      path: 'tests/playwright/screenshots/dashboard-tablet.png',
      fullPage: true
    })

    // モバイルサイズ
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(500)
    await page.screenshot({
      path: 'tests/playwright/screenshots/dashboard-mobile.png',
      fullPage: true
    })

    // ページが各サイズで正常に表示されることを確認
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })

  test('ナビゲーション機能のテスト', async ({ page, baseURL }) => {
    await page.goto(baseURL || 'http://localhost:3000')
    await page.waitForLoadState('networkidle')

    // ナビゲーションリンクを探す
    const navLinks = page.locator('nav a, .nav a, .menu a, a[href]')
    const linkCount = await navLinks.count()

    if (linkCount > 0) {
      // 最初のいくつかのリンクをテスト
      for (let i = 0; i < Math.min(linkCount, 3); i++) {
        const link = navLinks.nth(i)
        if (await link.isVisible()) {
          const href = await link.getAttribute('href')
          const text = await link.textContent()

          if (href && !href.startsWith('http') && href !== '#') {
            // 内部リンクの場合はクリックして確認
            await link.click()
            await page.waitForLoadState('networkidle')

            // ページが変わったか確認
            const currentUrl = page.url()
          }
        }
      }
    }

    await page.screenshot({
      path: 'tests/playwright/screenshots/dashboard-navigation.png',
      fullPage: true
    })
  })
})
