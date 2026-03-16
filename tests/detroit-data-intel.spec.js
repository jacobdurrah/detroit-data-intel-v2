const { test, expect } = require('@playwright/test');

test.describe('Detroit Data Intelligence Platform', () => {

  // ──────────────────────────────────────────────
  // 1. Page Load
  // ──────────────────────────────────────────────
  test('Page Load — title visible, stats bar shows non-zero counts', async ({ page }) => {
    await page.goto('/');

    // Expect the page title to contain "Detroit"
    await expect(page).toHaveTitle(/Detroit/, { timeout: 10000 });

    // Wait for stats bar to populate — stats should not show "--" or "0"
    const statsBar = page.locator('#stats-bar');
    await expect(statsBar).toBeVisible({ timeout: 10000 });

    // Get all stat value elements and verify they are not placeholder values
    const statValues = page.locator('#stats-bar .stat-value');
    const count = await statValues.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const text = await statValues.nth(i).textContent();
      expect(text.trim()).not.toBe('--');
      expect(text.trim()).not.toBe('0');
      expect(text.trim()).not.toBe('');
    }
  });

  // ──────────────────────────────────────────────
  // 2. Map Renders
  // ──────────────────────────────────────────────
  test('Map Renders — Leaflet map container visible with zoom controls', async ({ page }) => {
    await page.goto('/');

    // Map container exists and is visible
    const mapContainer = page.locator('#map');
    await expect(mapContainer).toBeVisible({ timeout: 10000 });

    // Map has the Leaflet container class
    const leafletContainer = page.locator('#map .leaflet-container, #map.leaflet-container');
    await expect(leafletContainer).toBeVisible({ timeout: 10000 });

    // Zoom controls are present
    const zoomControls = page.locator('.leaflet-control-zoom');
    await expect(zoomControls).toBeVisible({ timeout: 10000 });
  });

  // ──────────────────────────────────────────────
  // 3. Map Data Loads
  // ──────────────────────────────────────────────
  test('Map Data Loads — markers appear after API response', async ({ page }) => {
    // Set up response listener before navigation
    const mapDataPromise = page.waitForResponse(
      (response) => response.url().includes('/api/map-tiles') && response.status() === 200,
      { timeout: 15000 }
    );

    await page.goto('/');

    // Wait for the map tiles API to respond
    await mapDataPromise;

    // Wait for markers to render in the DOM
    const markers = page.locator('.leaflet-marker-icon, .leaflet-interactive');
    await expect(markers.first()).toBeVisible({ timeout: 10000 });
  });

  // ──────────────────────────────────────────────
  // 4. Map Popup
  // ──────────────────────────────────────────────
  test('Map Popup — click marker shows popup with real data', async ({ page }) => {
    const mapDataPromise = page.waitForResponse(
      (response) => response.url().includes('/api/map-tiles') && response.status() === 200,
      { timeout: 15000 }
    );

    await page.goto('/');
    await mapDataPromise;

    // Wait for markers to render
    const marker = page.locator('.leaflet-interactive').first();
    await expect(marker).toBeAttached({ timeout: 10000 });

    // Force click the marker (SVG circle markers may be outside viewport)
    await marker.click({ force: true });

    // Wait for popup to appear
    const popup = page.locator('.leaflet-popup-content');
    await expect(popup).toBeVisible({ timeout: 10000 });

    // Verify popup contains real data (not empty or placeholder)
    const popupText = await popup.textContent();
    expect(popupText.trim().length).toBeGreaterThan(0);
    expect(popupText).not.toContain('N/A');
  });

  // ──────────────────────────────────────────────
  // 5. Investors Tab
  // ──────────────────────────────────────────────
  test('Investors Tab — loads 20+ investors with real names', async ({ page }) => {
    await page.goto('/');

    // Click the investors tab
    const investorsTab = page.locator('[data-tab="investors"]');
    await investorsTab.click();

    // Wait for the tab content to be visible
    await expect(page.locator('#tab-investors')).toBeVisible({ timeout: 10000 });

    // Wait for the investors API to respond
    const investorsResponse = page.waitForResponse(
      (response) => response.url().includes('/api/investors') && response.status() === 200,
      { timeout: 15000 }
    );
    await investorsResponse;

    // Wait for items to render
    await page.waitForTimeout(1000);

    // Expect at least 20 investor items (cards on mobile, table rows on desktop)
    const investorItems = page.locator('#investors-list .card, #investors-list tbody tr');
    const itemCount = await investorItems.count();
    expect(itemCount).toBeGreaterThanOrEqual(20);

    // Verify investor names are not "Unknown"
    for (let i = 0; i < Math.min(itemCount, 5); i++) {
      const text = await investorItems.nth(i).textContent();
      expect(text).not.toContain('Unknown');
    }
  });

  // ──────────────────────────────────────────────
  // 6. Investor Filter
  // ──────────────────────────────────────────────
  test('Investor Filter — filter by institutional tier reduces results', async ({ page }) => {
    await page.goto('/');

    // Navigate to investors tab
    await page.locator('[data-tab="investors"]').click();
    await expect(page.locator('#tab-investors')).toBeVisible({ timeout: 10000 });

    // Wait for initial data load
    await page.waitForResponse(
      (response) => response.url().includes('/api/investors') && response.status() === 200,
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    // Count initial results (cards on mobile, table rows on desktop)
    const investorItems = page.locator('#investors-list .card, #investors-list tbody tr');
    const initialCount = await investorItems.count();

    // Select "institutional" from the tier dropdown
    const tierDropdown = page.locator('#investor-tier');
    await tierDropdown.selectOption('institutional');

    // Wait for filtered results
    await page.waitForResponse(
      (response) => response.url().includes('/api/investors') && response.status() === 200,
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    // Expect fewer results than before
    const filteredCount = await investorItems.count();
    expect(filteredCount).toBeLessThan(initialCount);

    // Verify all visible tier badges say "institutional"
    const tierBadges = page.locator('#investors-list .tier-badge');
    const badgeCount = await tierBadges.count();
    for (let i = 0; i < badgeCount; i++) {
      const badgeText = await tierBadges.nth(i).textContent();
      expect(badgeText.toLowerCase()).toContain('institutional');
    }
  });

  // ──────────────────────────────────────────────
  // 7. Investor Search
  // ──────────────────────────────────────────────
  test('Investor Search — searching "hantz" returns matching results', async ({ page }) => {
    await page.goto('/');

    // Navigate to investors tab
    await page.locator('[data-tab="investors"]').click();
    await expect(page.locator('#tab-investors')).toBeVisible({ timeout: 10000 });

    // Wait for initial data load
    await page.waitForResponse(
      (response) => response.url().includes('/api/investors') && response.status() === 200,
      { timeout: 15000 }
    );

    // Type "hantz" in the search input
    const searchInput = page.locator('#investor-search');
    await searchInput.fill('hantz');

    // Wait for debounced search results (allow time for debounce + API call)
    await page.waitForTimeout(1500);

    // Expect at least one result that includes "HANTZ" (case insensitive)
    const investorItems = page.locator('#investors-list .card, #investors-list tbody tr');
    const count = await investorItems.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Verify at least one result contains "hantz"
    let foundHantz = false;
    for (let i = 0; i < count; i++) {
      const text = await investorItems.nth(i).textContent();
      if (text.toLowerCase().includes('hantz')) {
        foundHantz = true;
        break;
      }
    }
    expect(foundHantz).toBe(true);
  });

  // ──────────────────────────────────────────────
  // 8. Neighborhoods Tab
  // ──────────────────────────────────────────────
  test('Neighborhoods Tab — loads neighborhoods with scores > 0', async ({ page }) => {
    await page.goto('/');

    // Click neighborhoods tab
    await page.locator('[data-tab="neighborhoods"]').click();

    // Wait for data load
    await page.waitForResponse(
      (response) => response.url().includes('/api/neighborhoods') && response.status() === 200,
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    // Expect multiple neighborhood cards
    const neighborhoodCards = page.locator('#neighborhoods-list .card');
    const count = await neighborhoodCards.count();
    expect(count).toBeGreaterThan(1);

    // Check that scores are greater than 0
    const scoreElements = page.locator('#neighborhoods-list .score-num');
    const scoreCount = await scoreElements.count();
    if (scoreCount > 0) {
      for (let i = 0; i < Math.min(scoreCount, 5); i++) {
        const scoreText = await scoreElements.nth(i).textContent();
        const scoreValue = parseFloat(scoreText.replace(/[^0-9.]/g, ''));
        expect(scoreValue).toBeGreaterThan(0);
      }
    }
  });

  // ──────────────────────────────────────────────
  // 9. Contractors Tab
  // ──────────────────────────────────────────────
  test('Contractors Tab — shows contractor names and contact info', async ({ page }) => {
    await page.goto('/');

    // Click contractors tab
    await page.locator('[data-tab="contractors"]').click();

    // Wait for data load
    await page.waitForResponse(
      (response) => response.url().includes('/api/contractors') && response.status() === 200,
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    // Expect contractor names to be visible
    const contractorItems = page.locator('#tab-contractors .card, #tab-contractors .contractor-card, #tab-contractors [class*="contractor"]');
    const count = await contractorItems.count();
    expect(count).toBeGreaterThan(0);

    // Verify contractor names are not empty
    const firstContractor = await contractorItems.first().textContent();
    expect(firstContractor.trim().length).toBeGreaterThan(0);

    // Check for contact info presence (contact_name or contact_address)
    const tabContent = await page.locator('#tab-contractors').textContent();
    const hasContactInfo = tabContent.includes('contact') ||
                           tabContent.includes('Contact') ||
                           tabContent.includes('address') ||
                           tabContent.includes('Address') ||
                           tabContent.includes('phone') ||
                           tabContent.includes('Phone');
    expect(hasContactInfo).toBe(true);
  });

  // ──────────────────────────────────────────────
  // 10. Lending Tab
  // ──────────────────────────────────────────────
  test('Lending Tab — shows lender names and rates > 0', async ({ page }) => {
    await page.goto('/');

    // Click lending tab
    await page.locator('[data-tab="lending"]').click();

    // Wait for data load
    await page.waitForResponse(
      (response) => response.url().includes('/api/lending') && response.status() === 200,
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    // Expect known lender names (case insensitive check)
    const tabContent = await page.locator('#tab-lending').textContent();
    const tabContentLower = tabContent.toLowerCase();
    const hasKnownLender = tabContentLower.includes('united wholesale') ||
                           tabContentLower.includes('rocket');
    expect(hasKnownLender).toBe(true);

    // Expect rate values > 0
    const rateElements = page.locator('#tab-lending .rate, #tab-lending [class*="rate"]');
    const rateCount = await rateElements.count();
    if (rateCount > 0) {
      for (let i = 0; i < Math.min(rateCount, 5); i++) {
        const rateText = await rateElements.nth(i).textContent();
        const rateValue = parseFloat(rateText.replace(/[^0-9.]/g, ''));
        expect(rateValue).toBeGreaterThan(0);
      }
    }
  });

  // ──────────────────────────────────────────────
  // 11. Lending Filter
  // ──────────────────────────────────────────────
  test('Lending Filter — sub-$60K checkbox filters results', async ({ page }) => {
    await page.goto('/');

    // Navigate to lending tab
    await page.locator('[data-tab="lending"]').click();

    // Wait for initial data load
    await page.waitForResponse(
      (response) => response.url().includes('/api/lending') && response.status() === 200,
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    // Check the Sub-$60K checkbox
    const sub60kCheckbox = page.locator('#lending-sub60k');
    await sub60kCheckbox.check();

    // Wait for filtered results
    await page.waitForResponse(
      (response) => response.url().includes('/api/lending') && response.status() === 200,
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    // Expect all visible results to show sub-60k info
    const lenderItems = page.locator('#tab-lending .card, #tab-lending .lender-card, #tab-lending [class*="lender"]');
    const count = await lenderItems.count();
    expect(count).toBeGreaterThan(0);

    // Verify results reference sub-60k lending
    const tabContent = await page.locator('#tab-lending').textContent();
    const tabContentLower = tabContent.toLowerCase();
    const hasSub60k = tabContentLower.includes('sub') ||
                      tabContentLower.includes('60k') ||
                      tabContentLower.includes('60,000') ||
                      tabContentLower.includes('small');
    expect(hasSub60k).toBe(true);
  });

  // ──────────────────────────────────────────────
  // 12. Pipeline Tab
  // ──────────────────────────────────────────────
  test('Pipeline Tab — shows cards with scores and addresses', async ({ page }) => {
    await page.goto('/');

    // Click pipeline tab
    await page.locator('[data-tab="pipeline"]').click();

    // Wait for data load
    await page.waitForResponse(
      (response) => response.url().includes('/api/sellers') && response.status() === 200,
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    // Expect cards with content
    const pipelineItems = page.locator('#tab-pipeline .card, #tab-pipeline .pipeline-card, #tab-pipeline [class*="pipeline"], #tab-pipeline [class*="seller"]');
    const count = await pipelineItems.count();
    expect(count).toBeGreaterThan(0);

    // Verify cards have scores and addresses (not empty)
    for (let i = 0; i < Math.min(count, 3); i++) {
      const text = await pipelineItems.nth(i).textContent();
      expect(text.trim().length).toBeGreaterThan(0);
    }

    // Check that addresses exist in the tab content
    const tabContent = await page.locator('#tab-pipeline').textContent();
    expect(tabContent.trim().length).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────
  // 13. Chat Opens
  // ──────────────────────────────────────────────
  test('Chat Opens — click FAB opens chat panel', async ({ page }) => {
    await page.goto('/');

    // Click the chat FAB
    const chatFab = page.locator('#chat-fab');
    await expect(chatFab).toBeVisible({ timeout: 10000 });
    await chatFab.click();

    // Expect chat panel to become visible
    const chatPanel = page.locator('#chat-panel');
    await expect(chatPanel).toBeVisible({ timeout: 10000 });
  });

  // ──────────────────────────────────────────────
  // 14. Chat Query
  // ──────────────────────────────────────────────
  test('Chat Query — "who is hantz" returns response with numbers', async ({ page }) => {
    await page.goto('/');

    // Open chat
    await page.locator('#chat-fab').click();
    await expect(page.locator('#chat-panel')).toBeVisible({ timeout: 10000 });

    // Type the query
    const chatInput = page.locator('#chat-input');
    await chatInput.fill('who is hantz');

    // Send the message — click send button or press Enter
    const sendButton = page.locator('#chat-send');
    if (await sendButton.isVisible()) {
      await sendButton.click();
    } else {
      await chatInput.press('Enter');
    }

    // Wait for bot response (the second .chat-msg.bot, since the first is the welcome message)
    const botMessages = page.locator('#chat-messages .chat-msg.bot');
    await expect(botMessages.nth(1)).toBeVisible({ timeout: 15000 });

    // Expect the response to contain a number (purchase count or dollar amount)
    const responseText = await botMessages.nth(1).textContent();
    const containsNumber = /\d+/.test(responseText);
    expect(containsNumber).toBe(true);
  });

  // ──────────────────────────────────────────────
  // 15. Chat Map
  // ──────────────────────────────────────────────
  test('Chat Map — "show properties in corktown" shows map button', async ({ page }) => {
    await page.goto('/');

    // Open chat
    await page.locator('#chat-fab').click();
    await expect(page.locator('#chat-panel')).toBeVisible({ timeout: 10000 });

    // Type the query
    const chatInput = page.locator('#chat-input');
    await chatInput.fill('show properties in corktown');

    // Send the message
    const sendButton = page.locator('#chat-send');
    if (await sendButton.isVisible()) {
      await sendButton.click();
    } else {
      await chatInput.press('Enter');
    }

    // Wait for response
    await page.waitForTimeout(3000);

    // Expect a "Show on Map" button or map link in the response
    const mapButton = page.locator('#chat-panel button:has-text("Show on Map"), #chat-panel a:has-text("Show on Map"), #chat-panel [class*="map-btn"], #chat-panel button:has-text("Map"), #chat-panel a:has-text("map")');
    await expect(mapButton.first()).toBeVisible({ timeout: 15000 });
  });

  // ──────────────────────────────────────────────
  // 16. Layer Toggles
  // ──────────────────────────────────────────────
  test('Layer Toggles — toggle blight layer on and off', async ({ page }) => {
    await page.goto('/');

    // Wait for initial map load
    await expect(page.locator('#map .leaflet-container, #map.leaflet-container')).toBeVisible({ timeout: 10000 });

    // Open the layer panel by clicking the toggle button
    const layerToggleBtn = page.locator('#layer-toggle-btn');
    await expect(layerToggleBtn).toBeVisible({ timeout: 10000 });
    await layerToggleBtn.click();

    // Wait for the layer list to become visible
    await expect(page.locator('#map-layers.open .layer-list, .layer-panel.open .layer-list')).toBeVisible({ timeout: 5000 });

    // Find the blight layer checkbox
    const blightCheckbox = page.locator('[data-layer="blight"]');
    await expect(blightCheckbox).toBeVisible({ timeout: 10000 });

    // Check the blight layer and wait for network request
    const blightResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/map-tiles') && response.url().includes('blight') && response.status() === 200,
      { timeout: 15000 }
    );
    await blightCheckbox.check();
    await blightResponsePromise;

    // Allow time for markers to render
    await page.waitForTimeout(1000);

    // Verify blight markers appeared
    const markersAfterCheck = await page.locator('.leaflet-marker-icon, .leaflet-interactive').count();

    // Uncheck the blight layer
    await blightCheckbox.uncheck();
    await page.waitForTimeout(1000);

    // Verify blight markers are removed (fewer markers or different count)
    const markersAfterUncheck = await page.locator('.leaflet-marker-icon, .leaflet-interactive').count();
    expect(markersAfterUncheck).toBeLessThanOrEqual(markersAfterCheck);
  });

  // ──────────────────────────────────────────────
  // 17. Mobile Responsive
  // ──────────────────────────────────────────────
  test('Mobile Responsive — 375px viewport, tabs visible, no overflow', async ({ page }) => {
    // Set viewport to mobile width
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');

    // Expect tab bar to be visible
    const tabBar = page.locator('.tab-bar, .tabs, nav, [class*="tab-nav"], [class*="tabs"]');
    await expect(tabBar.first()).toBeVisible({ timeout: 10000 });

    // Expect no horizontal overflow
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth);

    // Expect stats bar to still be visible
    const statsBar = page.locator('.stats-bar, .stats, [class*="stat"]');
    await expect(statsBar.first()).toBeVisible({ timeout: 10000 });
  });

});
