-- Add notes column to KGR workbench
ALTER TABLE twb_kgr_workbench ADD COLUMN IF NOT EXISTS notes TEXT;
