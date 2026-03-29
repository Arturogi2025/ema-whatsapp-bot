-- ============================================================
-- Bolt WhatsApp AI — Supabase Schema
-- 4 nuevas tablas para el módulo de WhatsApp + IA
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Extensión UUID (probablemente ya existe si usas KOVA)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. conversations — Una conversación por número de teléfono
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_phone TEXT NOT NULL UNIQUE,
  lead_name TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'scheduled', 'closed')),
  source TEXT DEFAULT 'whatsapp',
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_phone ON conversations (lead_phone);
CREATE INDEX idx_conversations_status ON conversations (status);

-- ============================================================
-- 2. messages — Historial completo de mensajes
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, timestamp);

-- ============================================================
-- 3. leads_bolt — Leads calificados de la agencia Bolt
-- ============================================================
CREATE TABLE IF NOT EXISTS leads_bolt (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  name TEXT,
  phone TEXT NOT NULL,
  project_type TEXT
    CHECK (project_type IS NULL OR project_type IN (
      'web', 'ecommerce', 'landing', 'redesign', 'custom'
    )),
  objective TEXT,
  preferred_datetime TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'scheduled', 'converted', 'lost')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_bolt_phone ON leads_bolt (phone);
CREATE INDEX idx_leads_bolt_status ON leads_bolt (status);

-- ============================================================
-- 4. portfolio_examples — Catálogo de trabajos para enviar
-- ============================================================
CREATE TABLE IF NOT EXISTS portfolio_examples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL
    CHECK (category IN ('web', 'ecommerce', 'landing', 'custom')),
  title TEXT NOT NULL,
  url TEXT,
  image_url TEXT,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portfolio_category ON portfolio_examples (category) WHERE active = true;

-- ============================================================
-- Trigger: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER leads_bolt_updated_at
  BEFORE UPDATE ON leads_bolt
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Trigger: auto-increment message_count on conversations
-- ============================================================
CREATE OR REPLACE FUNCTION increment_message_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET message_count = message_count + 1
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_increment_count
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION increment_message_count();
