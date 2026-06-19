-- Create table for match predictions
CREATE TABLE IF NOT EXISTS wc2026_match_predictions (
  match_id BIGINT PRIMARY KEY REFERENCES wc2026_matches(id) ON DELETE CASCADE,
  source_url TEXT,
  title TEXT,
  sapo TEXT,
  force_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  form_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  prediction_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  media_prediction JSONB NOT NULL DEFAULT '{}'::jsonb,
  full_analysis TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE wc2026_match_predictions ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists
DROP POLICY IF EXISTS "Public read wc2026 match predictions" ON wc2026_match_predictions;

-- Create policy to allow public select
CREATE POLICY "Public read wc2026 match predictions"
  ON wc2026_match_predictions FOR SELECT
  TO anon, authenticated
  USING (true);

-- Grant select
GRANT SELECT ON TABLE wc2026_match_predictions TO anon, authenticated;
