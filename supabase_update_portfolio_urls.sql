-- ============================================================
-- Update portfolio_examples: use single portfolio URL, remove image_urls
-- The AI now shares https://www.boltdevlabs.com/portfolio as a single link
-- instead of sending individual images per project.
-- ============================================================

-- Set all portfolio URLs to the main portfolio page
UPDATE portfolio_examples
SET url = 'https://www.boltdevlabs.com/portfolio',
    image_url = NULL;

-- Verify
SELECT id, category, title, url, image_url FROM portfolio_examples;
