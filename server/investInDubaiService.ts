import { chromium } from 'playwright';
import { logger } from './logger';

export async function scrapeInvestInDubai(query: string, maxResults: number = 20) {
  logger.info('invest_in_dubai_scrape_started', { query });
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    // Go to the directory page
    await page.goto('https://investindubai.gov.ae/en/business-directory', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Wait for the search input by ID as suggested by user
    await page.waitForSelector('#dul-search-input', { timeout: 15000 });
    
    // Type the query
    await page.fill('#dul-search-input', query);
    
    // Click the search button (text "ابحث" or "Search" or the button class)
    // Based on user image, it's .dul-search__button
    await page.click('.dul-search__button');
    
    // Wait for results to load
    // We'll wait for the results container or cards
    try {
      await page.waitForSelector('.dul-search-card', { timeout: 15000 });
    } catch (e) {
      logger.warn('invest_in_dubai_timeout_waiting_for_results', { query });
    }
    
    // Extract results
    const results = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.dul-search-card'));
      return cards.map(card => {
        const name = card.querySelector('.dul-search-card__title')?.textContent?.trim() || '';
        // The user mentioned "DUL رقم"
        const dulText = card.querySelector('.dul-search-card__dul')?.textContent?.trim() || 
                        card.querySelector('.dul-search-card__id')?.textContent?.trim() || '';
        const category = card.querySelector('.dul-search-card__category')?.textContent?.trim() || '';
        
        return {
          businessName: name,
          dulNumber: dulText.replace('DUL رقم', '').trim(),
          category: category,
          url: window.location.href,
          platform: 'invest_in_dubai'
        };
      });
    });
    
    logger.info('invest_in_dubai_scrape_completed', { query, count: results.length });
    return results.slice(0, maxResults);
    
  } catch (error: any) {
    logger.error('invest_in_dubai_scrape_failed', { query, error: error.message });
    return [];
  } finally {
    await browser.close();
  }
}
