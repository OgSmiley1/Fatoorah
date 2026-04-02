import { chromium } from 'playwright';
import { logger } from './logger.ts';

export async function scrapeInvestInDubai(query: string, maxResults: number = 20) {
  logger.info('invest_in_dubai_scrape_started', { query });

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  } catch (err: any) {
    logger.error('invest_in_dubai_browser_launch_failed', { query, error: err.message });
    return [];
  }

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.info('invest_in_dubai_retry_attempt', { query, attempt });
          await page.waitForTimeout(2000 * attempt);
        }

        const targetUrl = 'https://investindubai.gov.ae/en/business-directory';
        logger.info('invest_in_dubai_navigating', { targetUrl });

        await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 90000
        });

        let inputFound = false;
        const selectors = ['#dul-search-input', 'input[placeholder*="Search"]', 'input[type="text"]', '.dul-search__input'];

        for (const selector of selectors) {
          try {
            await page.waitForSelector(selector, { timeout: 15000 });
            const input = await page.$(selector);
            if (input) {
              await input.fill(query);
              await page.waitForTimeout(1000);

              const btnSelectors = ['.dul-search__button', 'button.search-btn', '.dul-search-button', 'button[type="submit"]'];
              let btnClicked = false;
              for (const btnSelector of btnSelectors) {
                const btn = await page.$(btnSelector);
                if (btn) {
                  await btn.click();
                  btnClicked = true;
                  break;
                }
              }

              if (!btnClicked) {
                await page.keyboard.press('Enter');
              }

              inputFound = true;
              break;
            }
          } catch (e) {
            continue;
          }
        }

        if (!inputFound) {
          logger.warn('invest_in_dubai_no_input_found_trying_direct_type', { query });
          await page.keyboard.type(query);
          await page.keyboard.press('Enter');
        }

        try {
          await page.waitForSelector('.dul-search-card', { timeout: 60000 });
        } catch (e) {
          const noResults = await page.isVisible('.no-results-message') || await page.isVisible('text=No results');
          if (noResults) {
            logger.info('invest_in_dubai_no_results_found', { query });
            return [];
          }
          throw e;
        }

        const results = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('.dul-search-card'));
          return cards.map(card => {
            const name = card.querySelector('.dul-search-card__title')?.textContent?.trim() || '';
            const dulText = card.querySelector('.dul-search-card__dul')?.textContent?.trim() ||
                            card.querySelector('.dul-search-card__id')?.textContent?.trim() || '';
            const category = card.querySelector('.dul-search-card__category')?.textContent?.trim() || '';

            return {
              businessName: name || 'Unknown Business',
              dulNumber: dulText.replace('DUL رقم', '').trim() || null,
              category: category || 'General',
              url: window.location.href,
              platform: 'invest_in_dubai'
            };
          }).filter(r => r.businessName && r.businessName !== 'Unknown Business');
        });

        logger.info('invest_in_dubai_scrape_completed', { query, count: results.length });
        return results.slice(0, maxResults);

      } catch (error: any) {
        if (attempt === maxRetries) {
          logger.error('invest_in_dubai_scrape_failed_after_retries', { query, error: error.message });
          return [];
        }
        logger.warn('invest_in_dubai_attempt_failed', { query, attempt, error: error.message });
      }
    }
    return [];
  } catch (error: any) {
    logger.error('invest_in_dubai_fatal_error', { query, error: error.message });
    return [];
  } finally {
    try { await context.close(); } catch { /* ignore */ }
    try { await browser.close(); } catch { /* ignore */ }
  }
}
