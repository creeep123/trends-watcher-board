-- Allow blocked_queries item_type in twb_read_items (no schema change needed)
-- blocked_queries rows never expire (they are not in EXPIRY_TYPES)
-- Only need to ensure DELETE policy exists for unblocking

CREATE POLICY "Allow anon delete" ON twb_read_items FOR DELETE USING (true);
