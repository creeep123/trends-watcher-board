CREATE TABLE IF NOT EXISTS twb_daily_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_goal int NOT NULL DEFAULT 40,
  new_words_goal int NOT NULL DEFAULT 20,
  info_goal int NOT NULL DEFAULT 20,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default row
INSERT INTO twb_daily_goals (id, total_goal, new_words_goal, info_goal)
VALUES ('00000000-0000-0000-0000-000000000001', 40, 20, 20)
ON CONFLICT DO NOTHING;
