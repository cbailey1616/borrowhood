-- 008_categories_seed.sql
-- Seed item categories beyond just "Tools"

-- Update existing "Tools" row to "Tools & Hardware"
UPDATE categories SET name = 'Tools & Hardware', slug = 'tools-hardware', icon = 'hammer-outline', sort_order = 1
WHERE slug = 'tools';

-- Insert new categories (idempotent)
INSERT INTO categories (name, slug, icon, sort_order) VALUES
  ('Tools & Hardware', 'tools-hardware', 'hammer-outline', 1),
  ('Kitchen & Cooking', 'kitchen-cooking', 'restaurant-outline', 2),
  ('Garden & Outdoor', 'garden-outdoor', 'leaf-outline', 3),
  ('Sports & Recreation', 'sports-recreation', 'football-outline', 4),
  ('Electronics & Tech', 'electronics-tech', 'laptop-outline', 5),
  ('Party & Events', 'party-events', 'gift-outline', 6),
  ('Kids & Baby', 'kids-baby', 'happy-outline', 7),
  ('Camping & Travel', 'camping-travel', 'bonfire-outline', 8),
  ('Cleaning', 'cleaning', 'sparkles-outline', 9),
  ('Other', 'other', 'ellipsis-horizontal-outline', 10)
ON CONFLICT (slug) DO NOTHING;
