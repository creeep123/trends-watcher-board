ALTER TABLE twb_kgr_workbench
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unresearched'
CHECK (status IN ('unresearched', 'researched', 'to-publish', 'abandoned'));
