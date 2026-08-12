CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS intelligence_source_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  external_id text NOT NULL,
  title text NOT NULL,
  url text NOT NULL DEFAULT '',
  published_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  seen_count integer NOT NULL DEFAULT 1,
  score double precision NOT NULL DEFAULT 0,
  item_type text NOT NULL DEFAULT 'unknown',
  description text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  included boolean NOT NULL DEFAULT true,
  filter_reason text,
  fingerprint text NOT NULL,
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS intelligence_source_items_period_idx
  ON intelligence_source_items (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_source_items_source_period_idx
  ON intelligence_source_items (source, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_source_items_fingerprint_idx
  ON intelligence_source_items (fingerprint);

CREATE TABLE IF NOT EXISTS intelligence_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  topic_type text NOT NULL DEFAULT 'unknown',
  summary text NOT NULL DEFAULT '',
  heat double precision NOT NULL DEFAULT 0,
  source_count integer NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS intelligence_topics_period_idx
  ON intelligence_topics (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS intelligence_topic_items (
  topic_id uuid NOT NULL REFERENCES intelligence_topics(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES intelligence_source_items(id) ON DELETE CASCADE,
  match_method text NOT NULL DEFAULT 'exact',
  confidence double precision NOT NULL DEFAULT 1,
  PRIMARY KEY (topic_id, item_id)
);

CREATE TABLE IF NOT EXISTS intelligence_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  status text NOT NULL DEFAULT 'ready',
  version integer NOT NULL DEFAULT 1,
  content jsonb NOT NULL,
  source_item_count integer NOT NULL DEFAULT 0,
  topic_count integer NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_start, period_end)
);

CREATE INDEX IF NOT EXISTS intelligence_briefs_period_idx
  ON intelligence_briefs (period_start DESC, period_end DESC);

CREATE TABLE IF NOT EXISTS intelligence_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  fetched_count integer NOT NULL DEFAULT 0,
  new_count integer NOT NULL DEFAULT 0,
  selected_count integer NOT NULL DEFAULT 0,
  error text
);
