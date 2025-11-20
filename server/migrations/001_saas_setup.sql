-- SaaS Migration: User Authentication & Billing
-- This preserves existing data and adds multi-tenancy

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users table for authentication and billing
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  plan_status TEXT NOT NULL DEFAULT 'active', -- active | past_due | inactive
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  
  -- Usage tracking
  usage_messages INT NOT NULL DEFAULT 0,
  usage_storage_mb INT NOT NULL DEFAULT 0,
  usage_whatsapp_groups INT NOT NULL DEFAULT 0,
  usage_period_start TIMESTAMP NOT NULL DEFAULT NOW(),
  usage_period_end TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  
  -- Admin and metadata
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- API keys for programmatic access
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default Key',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP
);

-- WhatsApp instance configuration per user
CREATE TABLE IF NOT EXISTS user_whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instance_id TEXT,
  access_token TEXT,
  mobile_number TEXT,
  whitelisted_groups TEXT,
  webhook_secret TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, instance_id)
);

-- Subscription plans configuration
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  price_id TEXT UNIQUE, -- Stripe price ID
  max_messages INT NOT NULL,
  max_storage_mb INT NOT NULL,
  max_whatsapp_groups INT NOT NULL,
  max_pid_alerts INT NOT NULL,
  features TEXT[], -- JSON array of features
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Insert default plans
INSERT INTO subscription_plans (name, max_messages, max_storage_mb, max_whatsapp_groups, max_pid_alerts, features) VALUES
('free', 500, 100, 3, 10, ARRAY['basic_parsing', 'email_alerts']),
('pro', 10000, 5000, 20, 100, ARRAY['basic_parsing', 'email_alerts', 'whatsapp_alerts', 'excel_export']),
('business', 100000, 50000, 100, 500, ARRAY['basic_parsing', 'email_alerts', 'whatsapp_alerts', 'excel_export', 'api_access', 'custom_parsing'])
ON CONFLICT (name) DO NOTHING;

-- Usage logs for tracking
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_type TEXT NOT NULL, -- 'message', 'storage', 'group', 'alert'
  amount INT NOT NULL DEFAULT 1,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ================================
-- ADD USER_ID TO EXISTING TABLES
-- ================================

-- Add user_id to watch_listings (for data isolation)
ALTER TABLE watch_listings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Add user_id to watch_requirements
ALTER TABLE watch_requirements ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Add user_id to contacts  
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Add user_id to processing_logs
ALTER TABLE processing_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Add user_id to pid_alerts
ALTER TABLE pid_alerts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Add user_id to system_stats
ALTER TABLE system_stats ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Add user_id to whatsapp_groups
ALTER TABLE whatsapp_groups ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Add user_id to message_logs
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- ================================
-- CREATE ADMIN USER AND MIGRATE DATA
-- ================================

-- Create admin user (you and your team)
INSERT INTO users (
  email, 
  password_hash, 
  plan, 
  plan_status, 
  is_admin, 
  first_name,
  usage_messages,
  usage_storage_mb,
  usage_whatsapp_groups
) VALUES (
  'admin@watchparser.com',
  '$2a$10$K7L1OyBAuP8PFPDQvF5E2e.cVvZo4GQ8RP2xK1zH8RZq4j9JrGzha', -- password: Admin!234
  'business',
  'active',
  true,
  'Admin',
  999999, -- Unlimited for admin
  999999,
  999999
) ON CONFLICT (email) DO NOTHING;

-- Get the admin user ID
DO $$
DECLARE
    admin_user_id UUID;
BEGIN
    SELECT id INTO admin_user_id FROM users WHERE email = 'admin@watchparser.com';
    
    -- Assign all existing data to admin user
    UPDATE watch_listings SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE watch_requirements SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE contacts SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE processing_logs SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE pid_alerts SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE system_stats SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE whatsapp_groups SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE message_logs SET user_id = admin_user_id WHERE user_id IS NULL;
    
    -- Create admin WhatsApp config from current config
    INSERT INTO user_whatsapp_config (
      user_id,
      instance_id,
      access_token,
      mobile_number,
      whitelisted_groups,
      is_active
    ) VALUES (
      admin_user_id,
      (SELECT instance_id FROM wa_config LIMIT 1), 
      (SELECT access_token FROM wa_config LIMIT 1),
      (SELECT mobile_number FROM wa_config LIMIT 1),
      (SELECT whitelisted_groups FROM wa_config LIMIT 1),
      true
    ) ON CONFLICT DO NOTHING;
END $$;

-- ================================
-- INDEXES FOR PERFORMANCE
-- ================================

-- Indexes for data isolation queries
CREATE INDEX IF NOT EXISTS idx_watch_listings_user_id ON watch_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_requirements_user_id ON watch_requirements(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_logs_user_id ON processing_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_pid_alerts_user_id ON pid_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_user_id ON whatsapp_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_user_id ON message_logs(user_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_whatsapp_config_user_id ON user_whatsapp_config(user_id);
CREATE INDEX IF NOT EXISTS idx_user_whatsapp_config_instance ON user_whatsapp_config(instance_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);