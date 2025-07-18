-- Migration: Create dashboard tables for intelligent content dashboard
-- Created: 2025-07-18
-- Description: Initial database schema for the intelligent content dashboard

-- Create content_queue table for managing tweets awaiting approval
CREATE TABLE IF NOT EXISTS content_queue (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    url TEXT,
    source_feed VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    relevance_score DECIMAL(3,2) DEFAULT 0.0,
    generated_tweet TEXT NOT NULL,
    hashtags TEXT[],
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'posted')),
    rejection_reason TEXT,
    edited_tweet TEXT,
    original_tweet TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by VARCHAR(255),
    scheduled_for TIMESTAMP WITH TIME ZONE,
    posted_at TIMESTAMP WITH TIME ZONE,
    tweet_id VARCHAR(255) UNIQUE
);

-- Create tweet_performance table for tracking tweet analytics
CREATE TABLE IF NOT EXISTS tweet_performance (
    id SERIAL PRIMARY KEY,
    content_queue_id INTEGER REFERENCES content_queue(id) ON DELETE CASCADE,
    tweet_id VARCHAR(255) NOT NULL UNIQUE,
    retweets INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,
    quotes INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    engagement_rate DECIMAL(5,2) DEFAULT 0.0,
    url_clicks INTEGER DEFAULT 0,
    profile_clicks INTEGER DEFAULT 0,
    follows INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create keyword_filters table for managing content filtering
CREATE TABLE IF NOT EXISTS keyword_filters (
    id SERIAL PRIMARY KEY,
    keyword VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(100) NOT NULL,
    priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
    weight DECIMAL(3,2) DEFAULT 1.0 CHECK (weight BETWEEN 0.0 AND 5.0),
    is_active BOOLEAN DEFAULT true,
    is_exclude BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

-- Create tweet_templates table for managing tweet generation templates
CREATE TABLE IF NOT EXISTS tweet_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    template TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    variables TEXT[], -- Array of variable names like {title}, {url}, {hashtags}
    max_length INTEGER DEFAULT 280,
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 0.0,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

-- Create system_logs table for monitoring and debugging
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) NOT NULL CHECK (level IN ('error', 'warn', 'info', 'debug')),
    message TEXT NOT NULL,
    component VARCHAR(100) NOT NULL,
    operation VARCHAR(100),
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(255),
    duration_ms INTEGER,
    error_code VARCHAR(50),
    error_details JSONB,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_content_queue_status ON content_queue(status);
CREATE INDEX IF NOT EXISTS idx_content_queue_created_at ON content_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_content_queue_relevance_score ON content_queue(relevance_score);
CREATE INDEX IF NOT EXISTS idx_content_queue_category ON content_queue(category);

CREATE INDEX IF NOT EXISTS idx_tweet_performance_tweet_id ON tweet_performance(tweet_id);
CREATE INDEX IF NOT EXISTS idx_tweet_performance_created_at ON tweet_performance(created_at);
CREATE INDEX IF NOT EXISTS idx_tweet_performance_engagement_rate ON tweet_performance(engagement_rate);

CREATE INDEX IF NOT EXISTS idx_keyword_filters_category ON keyword_filters(category);
CREATE INDEX IF NOT EXISTS idx_keyword_filters_is_active ON keyword_filters(is_active);
CREATE INDEX IF NOT EXISTS idx_keyword_filters_priority ON keyword_filters(priority);

CREATE INDEX IF NOT EXISTS idx_tweet_templates_category ON tweet_templates(category);
CREATE INDEX IF NOT EXISTS idx_tweet_templates_is_active ON tweet_templates(is_active);

CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_component ON system_logs(component);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_user_id ON system_logs(user_id);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_content_queue_updated_at 
    BEFORE UPDATE ON content_queue 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tweet_performance_updated_at 
    BEFORE UPDATE ON tweet_performance 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_keyword_filters_updated_at 
    BEFORE UPDATE ON keyword_filters 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tweet_templates_updated_at 
    BEFORE UPDATE ON tweet_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert some default data
INSERT INTO keyword_filters (keyword, category, priority, weight, description) VALUES
('artificial intelligence', 'ai', 5, 2.0, 'Core AI keyword'),
('machine learning', 'ai', 5, 2.0, 'Core ML keyword'),
('deep learning', 'ai', 4, 1.8, 'Deep learning related'),
('neural network', 'ai', 4, 1.7, 'Neural network related'),
('OpenAI', 'companies', 5, 2.0, 'OpenAI company'),
('Google AI', 'companies', 5, 2.0, 'Google AI research'),
('research', 'general', 3, 1.2, 'Research papers'),
('breakthrough', 'general', 4, 1.5, 'Breakthrough news'),
('innovation', 'general', 3, 1.3, 'Innovation related')
ON CONFLICT (keyword) DO NOTHING;

INSERT INTO tweet_templates (name, template, category, variables, description) VALUES
('Standard Research', 'Exciting AI research: {title} {url} {hashtags}', 'research', 
 ARRAY['title', 'url', 'hashtags'], 'Standard template for research papers'),
('Breaking News', '🚨 Breaking: {title} {url} {hashtags}', 'news', 
 ARRAY['title', 'url', 'hashtags'], 'Template for breaking news'),
('Company Update', 'Latest from {source}: {title} {url} {hashtags}', 'company', 
 ARRAY['source', 'title', 'url', 'hashtags'], 'Template for company updates'),
('Innovation Focus', '💡 Innovation alert: {title} Learn more: {url} {hashtags}', 'innovation', 
 ARRAY['title', 'url', 'hashtags'], 'Template for innovation content')
ON CONFLICT (name) DO NOTHING;