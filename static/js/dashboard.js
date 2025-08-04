/**
 * n8n-tweet Dashboard Main Controller
 * 
 * Main dashboard functionality including tab management, data loading,
 * real-time updates, and UI interactions
 */

class Dashboard {
    constructor() {
        this.api = new DashboardAPI();
        this.currentTab = 'health';
        this.updateInterval = null;
        this.charts = {};
        this.isLoading = false;
        
        this.init();
    }

    /**
     * Initialize dashboard
     */
    async init() {
        console.log('Initializing n8n-tweet Dashboard...');
        
        try {
            this.setupEventListeners();
            this.setupAutoUpdate();
            await this.loadInitialData();
            this.showAlert('ダッシュボードが正常に読み込まれました', 'success');
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            this.showAlert('ダッシュボードの初期化に失敗しました', 'danger');
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('[data-tab]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = link.getAttribute('data-tab');
                this.switchTab(tab);
            });
        });

        // Tweet filters
        const applyFiltersBtn = document.querySelector('button[onclick="loadTweets()"]');
        if (applyFiltersBtn) {
            applyFiltersBtn.onclick = () => this.loadTweets();
        }

        // Refresh buttons (if added later)
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-refresh]')) {
                const type = e.target.getAttribute('data-refresh');
                this.refreshData(type);
            }
        });

        // Window visibility change for pause/resume updates
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseUpdates();
            } else {
                this.resumeUpdates();
            }
        });
    }

    /**
     * Setup automatic updates
     */
    setupAutoUpdate() {
        this.updateInterval = setInterval(() => {
            if (!document.hidden && !this.isLoading) {
                this.refreshCurrentTab();
            }
        }, 30000); // Update every 30 seconds
    }

    /**
     * Load initial data for all tabs
     */
    async loadInitialData() {
        await this.loadHealth();
        this.updateLastUpdateTime();
    }

    /**
     * Switch between tabs
     */
    switchTab(tabName) {
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;

        // Load tab-specific data
        this.refreshCurrentTab();
    }

    /**
     * Refresh current tab data
     */
    async refreshCurrentTab() {
        switch (this.currentTab) {
            case 'health':
                await this.loadHealth();
                break;
            case 'metrics':
                await this.loadMetrics();
                break;
            case 'tweets':
                await this.loadTweets();
                break;
            case 'feeds':
                await this.loadFeeds();
                break;
        }
        this.updateLastUpdateTime();
    }

    /**
     * Load health data
     */
    async loadHealth() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            this.setLoadingState('health');
            const response = await this.api.getSystemHealth();
            const healthData = DataFormatters.formatHealthData(response);
            
            this.updateHealthUI(healthData);
        } catch (error) {
            console.error('Failed to load health data:', error);
            this.showAlert('ヘルス情報の読み込みに失敗しました', 'warning');
            this.updateHealthUI({ overall: 'error', components: {} });
        } finally {
            this.clearLoadingState('health');
            this.isLoading = false;
        }
    }

    /**
     * Load metrics data
     */
    async loadMetrics() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            this.setLoadingState('metrics');
            const response = await this.api.getMetrics();
            const metricsData = DataFormatters.formatMetricsData(response);
            
            this.updateMetricsUI(metricsData);
            this.updateMetricsChart(metricsData);
        } catch (error) {
            console.error('Failed to load metrics data:', error);
            this.showAlert('メトリクス情報の読み込みに失敗しました', 'warning');
        } finally {
            this.clearLoadingState('metrics');
            this.isLoading = false;
        }
    }

    /**
     * Load tweets data
     */
    async loadTweets() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            this.setLoadingState('tweets');
            
            // Get filter values
            const status = document.getElementById('tweet-status-filter')?.value || '';
            const category = document.getElementById('tweet-category-filter')?.value || '';
            const date = document.getElementById('tweet-date-filter')?.value || '';

            const options = {
                status,
                category,
                limit: 50
            };

            if (date) {
                options.startDate = date;
                options.endDate = date;
            }

            const response = await this.api.getTweets(options);
            const tweetsData = DataFormatters.formatTweetData(response);
            
            this.updateTweetsUI(tweetsData);
        } catch (error) {
            console.error('Failed to load tweets data:', error);
            this.showAlert('ツイート履歴の読み込みに失敗しました', 'warning');
        } finally {
            this.clearLoadingState('tweets');
            this.isLoading = false;
        }
    }

    /**
     * Load feeds data
     */
    async loadFeeds() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            this.setLoadingState('feeds');
            const response = await this.api.getFeeds();
            const feedsData = DataFormatters.formatFeedsData(response);
            
            this.updateFeedsUI(feedsData);
        } catch (error) {
            console.error('Failed to load feeds data:', error);
            this.showAlert('フィード情報の読み込みに失敗しました', 'warning');
        } finally {
            this.clearLoadingState('feeds');
            this.isLoading = false;
        }
    }

    /**
     * Update health UI
     */
    updateHealthUI(healthData) {
        // Update status indicators
        this.updateStatusBadge('system-status', healthData.components.system?.status || 'unknown');
        this.updateStatusBadge('redis-status', healthData.components.redis?.status || 'unknown');
        this.updateStatusBadge('n8n-status', healthData.components.n8n?.status || 'unknown');
        this.updateStatusBadge(
          'twitter-status',
          healthData.components.twitter?.status || 'unknown'
        );

        // Update detailed health information
        this.updateHealthDetails(healthData);
    }

    /**
     * Update metrics UI
     */
    updateMetricsUI(metricsData) {
        // Update metric cards
        const memoryUsage = Math.round(metricsData.memory?.used / 1024 / 1024) || 0;
        this.updateMetricValue('memory-usage', memoryUsage);

        const cpuUsage = Math.round(metricsData.cpu?.usage) || 0;
        this.updateMetricValue('cpu-usage', cpuUsage);

        const uptime = Math.round(metricsData.uptime / 3600) || 0;
        this.updateMetricValue('uptime', uptime);

        const tweetsToday = metricsData.tweets?.today || 0;
        this.updateMetricValue('tweets-today', tweetsToday);
    }

    /**
     * Update tweets UI
     */
    updateTweetsUI(tweetsData) {
        const container = document.getElementById('tweets-list');
        
        if (!tweetsData || tweetsData.length === 0) {
            container.innerHTML = '<p class="text-muted">ツイートデータがありません</p>';
            return;
        }

        const tweetsHtml = tweetsData.map(tweet => this.createTweetCard(tweet)).join('');
        container.innerHTML = tweetsHtml;
    }

    /**
     * Update feeds UI
     */
    updateFeedsUI(feedsData) {
        const container = document.getElementById('feeds-list');
        
        if (!feedsData || feedsData.length === 0) {
            container.innerHTML = '<p class="text-muted">フィードデータがありません</p>';
            return;
        }

        const feedsHtml = this.createFeedsTable(feedsData);
        container.innerHTML = feedsHtml;
    }

    /**
     * Update status badge
     */
    updateStatusBadge(elementId, status) {
        const element = document.getElementById(elementId);
        if (!element) return;

        let badgeClass = 'bg-secondary';
        let text = '不明';

        switch (status) {
            case 'healthy':
            case 'active':
            case 'online':
                badgeClass = 'bg-success';
                text = '正常';
                break;
            case 'warning':
                badgeClass = 'bg-warning';
                text = '警告';
                break;
            case 'error':
            case 'down':
            case 'offline':
                badgeClass = 'bg-danger';
                text = 'エラー';
                break;
            default:
                text = '確認中...';
        }

        element.innerHTML = `<span class="badge ${badgeClass}">${text}</span>`;
    }

    /**
     * Update metric value
     */
    updateMetricValue(elementId, value) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const valueElement = element.querySelector('.display-6');
        if (valueElement) {
            valueElement.textContent = value.toLocaleString();
        }
    }

    /**
     * Update health details
     */
    updateHealthDetails(healthData) {
        const container = document.getElementById('health-details');
        if (!container) return;

        const details = Object.entries(healthData.components).map(([name, data]) => ({
            component: name,
            status: data.status,
            details: data
        }));

        if (details.length === 0) {
            container.innerHTML = '<p class="text-muted">詳細情報がありません</p>';
            return;
        }

        const tableHtml = `
            <table class="table table-striped health-details-table">
                <thead>
                    <tr>
                        <th>コンポーネント</th>
                        <th>ステータス</th>
                        <th>詳細</th>
                    </tr>
                </thead>
                <tbody>
                    ${details.map(item => `
                        <tr>
                            <td><strong>${this.capitalize(item.component)}</strong></td>
                            <td>${this.getStatusBadge(item.status)}</td>
                            <td>${this.formatHealthDetails(item.details)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        container.innerHTML = tableHtml;
    }

    /**
     * Create tweet card HTML
     */
    createTweetCard(tweet) {
        const statusClass = `status-${tweet.status}`;
        const statusBadge = this.getStatusBadge(tweet.status);
        const date = tweet.createdAt ? new Date(tweet.createdAt).toLocaleString('ja-JP') : '不明';

        return `
            <div class="card tweet-card ${statusClass} mb-3">
                <div class="card-body">
                    <div class="tweet-content">${this.escapeHtml(tweet.content)}</div>
                    <div class="tweet-meta d-flex justify-content-between align-items-center">
                        <div>
                            ${statusBadge}
                            <span class="badge bg-secondary">${tweet.category}</span>
                            <small class="ms-2">${date}</small>
                        </div>
                        ${tweet.url
                          ? `<a href="${tweet.url}" target="_blank" ` +
                            `class="btn btn-sm btn-outline-primary">表示</a>`
                          : ''
                        }
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Create feeds table HTML
     */
    createFeedsTable(feedsData) {
        return `
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>フィード名</th>
                        <th>ステータス</th>
                        <th>最終更新</th>
                        <th>記事数</th>
                        <th>有効</th>
                    </tr>
                </thead>
                <tbody>
                    ${feedsData.map(feed => `
                        <tr>
                            <td>
                                <strong>${this.escapeHtml(feed.name)}</strong>
                                <br>
                                <small class="text-muted">${this.escapeHtml(feed.url)}</small>
                            </td>
                            <td>
                                <span class="feed-status-indicator ${feed.status}"></span>
                                ${this.getStatusBadge(feed.status)}
                            </td>
                            <td>
                                ${feed.lastUpdate
                                  ? new Date(feed.lastUpdate).toLocaleString('ja-JP')
                                  : '不明'
                                }
                            </td>
                            <td>${feed.itemCount}</td>
                            <td>
                                <span class="badge ${feed.enabled ? 'bg-success' : 'bg-secondary'}">
                                    ${feed.enabled ? '有効' : '無効'}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * Update metrics chart
     */
    updateMetricsChart(metricsData) {
        const ctx = document.getElementById('metrics-chart');
        if (!ctx) return;

        // Destroy existing chart if exists
        if (this.charts.metrics) {
            this.charts.metrics.destroy();
        }

        // Create simple chart with available data
        this.charts.metrics = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['メモリ使用量', 'CPU使用率', '今日のツイート'],
                datasets: [{
                    label: 'システムメトリクス',
                    data: [
                        Math.round(metricsData.memory?.percentage) || 0,
                        Math.round(metricsData.cpu?.usage) || 0,
                        metricsData.tweets?.today || 0
                    ],
                    backgroundColor: [
                        'rgba(13, 110, 253, 0.8)',
                        'rgba(255, 193, 7, 0.8)',
                        'rgba(25, 135, 84, 0.8)'
                    ],
                    borderColor: [
                        'rgba(13, 110, 253, 1)',
                        'rgba(255, 193, 7, 1)',
                        'rgba(25, 135, 84, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    /**
     * Utility functions
     */
    getStatusBadge(status) {
        const badges = {
            'healthy': '<span class="badge bg-success status-badge">正常</span>',
            'active': '<span class="badge bg-success status-badge">アクティブ</span>',
            'warning': '<span class="badge bg-warning status-badge">警告</span>',
            'error': '<span class="badge bg-danger status-badge">エラー</span>',
            'sent': '<span class="badge bg-success status-badge">送信済み</span>',
            'pending': '<span class="badge bg-warning status-badge">送信待ち</span>',
            'failed': '<span class="badge bg-danger status-badge">失敗</span>'
        };
        return badges[status] || '<span class="badge bg-secondary status-badge">不明</span>';
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatHealthDetails(details) {
        if (!details) return '詳細なし';
        
        const info = [];
        if (details.responseTime) info.push(`応答時間: ${details.responseTime}ms`);
        if (details.uptime) info.push(`稼働時間: ${Math.round(details.uptime / 3600)}時間`);
        if (details.version) info.push(`バージョン: ${details.version}`);
        
        return info.length > 0 ? info.join('<br>') : '詳細なし';
    }

    /**
     * Loading states
     */
    setLoadingState(section) {
        const elements = document.querySelectorAll(`#${section}-tab .card-body`);
        elements.forEach(el => el.classList.add('loading'));
    }

    clearLoadingState(section) {
        const elements = document.querySelectorAll(`#${section}-tab .card-body`);
        elements.forEach(el => el.classList.remove('loading'));
    }

    /**
     * Alert system
     */
    showAlert(message, type = 'info', duration = 5000) {
        const alertContainer = document.getElementById('alert-container');
        if (!alertContainer) return;

        const alertId = `alert-${Date.now()}`;
        const alertHtml = `
            <div id="${alertId}" class="alert alert-${type} alert-dismissible ` +
              `fade show alert-floating"
                 role="alert">
                ${this.escapeHtml(message)}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;

        alertContainer.insertAdjacentHTML('beforeend', alertHtml);

        // Auto-remove alert
        setTimeout(() => {
            const alertElement = document.getElementById(alertId);
            if (alertElement) {
                const bsAlert = new bootstrap.Alert(alertElement);
                bsAlert.close();
            }
        }, duration);
    }

    /**
     * Update management
     */
    updateLastUpdateTime() {
        const element = document.getElementById('last-update');
        if (element) {
            element.textContent = new Date().toLocaleTimeString('ja-JP');
        }
    }

    pauseUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    resumeUpdates() {
        if (!this.updateInterval) {
            this.setupAutoUpdate();
        }
    }

    refreshData(type) {
        switch (type) {
            case 'health':
                this.loadHealth();
                break;
            case 'metrics':
                this.loadMetrics();
                break;
            case 'tweets':
                this.loadTweets();
                break;
            case 'feeds':
                this.loadFeeds();
                break;
            case 'all':
                this.refreshCurrentTab();
                break;
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.pauseUpdates();
        
        // Destroy charts
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        
        this.charts = {};
    }
}

// Global function for tweet loading (referenced in HTML)
function loadTweets() {
    if (window.dashboard) {
        window.dashboard.loadTweets();
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.dashboard) {
        window.dashboard.destroy();
    }
});