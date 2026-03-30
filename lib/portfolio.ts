import { getSupabaseAdmin } from './supabase';

export interface PortfolioExample {
  id: string;
  category: string;
  title: string;
  url: string | null;
  image_url: string | null;
  description: string | null;
}

/**
 * Map project types mentioned by leads to portfolio categories.
 */
const CATEGORY_MAP: Record<string, string[]> = {
  'pagina web': ['web'],
  'página web': ['web'],
  'sitio web': ['web'],
  'web': ['web'],
  'tienda': ['ecommerce'],
  'tienda en linea': ['ecommerce'],
  'tienda en línea': ['ecommerce'],
  'ecommerce': ['ecommerce'],
  'e-commerce': ['ecommerce'],
  'landing': ['landing'],
  'landing page': ['landing'],
  'rediseño': ['web'],
  'rediseno': ['web'],
  'sistema': ['custom'],
  'aplicación': ['custom'],
  'aplicacion': ['custom'],
  'app': ['custom'],
  'a la medida': ['custom'],
};

/**
 * Detect the most relevant category from a text description.
 */
export function detectCategory(text: string): string {
  const lower = text.toLowerCase();

  for (const [keyword, categories] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(keyword)) {
      return categories[0];
    }
  }

  // Default to web if we can't detect
  return 'web';
}

/**
 * Get relevant portfolio examples by category.
 */
export async function getRelevantExamples(
  projectType: string,
  limit = 3
): Promise<PortfolioExample[]> {
  const supabase = getSupabaseAdmin();
  const category = detectCategory(projectType);

  const { data, error } = await supabase
    .from('portfolio_examples')
    .select('id, category, title, url, image_url, description')
    .eq('category', category)
    .eq('active', true)
    .limit(limit);

  if (error) {
    console.error('[Portfolio] Query failed:', error);
    return [];
  }

  // If no results for specific category, fall back to any active examples
  if (!data || data.length === 0) {
    const { data: fallback } = await supabase
      .from('portfolio_examples')
      .select('id, category, title, url, image_url, description')
      .eq('active', true)
      .limit(limit);

    return (fallback || []) as PortfolioExample[];
  }

  return data as PortfolioExample[];
}

/**
 * Format portfolio examples as text for WhatsApp message.
 */
export function formatPortfolioText(examples: PortfolioExample[]): string {
  if (examples.length === 0) return '';

  const lines = examples.map((ex, i) => {
    let line = `${i + 1}. *${ex.title}*`;
    if (ex.description) line += ` — ${ex.description}`;
    if (ex.url) line += `\n   🔗 ${ex.url}`;
    return line;
  });

  return lines.join('\n\n');
}
