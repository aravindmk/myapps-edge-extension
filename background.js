// Background service worker
// Receives scraped apps from the content script and stores them
// Handles requests from the popup

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Content script scraped apps from myapps.microsoft.com
    if (message.type === "APPS_SCRAPED" && message.apps) {
        chrome.storage.local.set({
            cachedApps: message.apps,
            cacheTime: Date.now(),
        });

        // If there's a scrape window we opened, close the whole window
        chrome.storage.local.get("scrapeWindowId", ({ scrapeWindowId }) => {
            if (scrapeWindowId) {
                chrome.windows.remove(scrapeWindowId).catch(() => { });
                chrome.storage.local.remove(["scrapeWindowId", "scrapeTabId"]);
            }
        });
    }

    // Popup requests cached apps
    if (message.type === "GET_APPS") {
        chrome.storage.local.get(
            { cachedApps: null, cacheTime: 0 },
            ({ cachedApps, cacheTime }) => {
                sendResponse({ apps: cachedApps, cacheTime });
            }
        );
        return true;
    }

    // Popup requests a fresh scrape
    if (message.type === "SCRAPE_APPS") {
        // Open myapps.microsoft.com in a minimized window so it's invisible
        chrome.windows.create(
            {
                url: "https://myapps.microsoft.com",
                state: "minimized",
                focused: false,
            },
            (win) => {
                const tabId = win.tabs[0].id;
                chrome.storage.local.set({
                    scrapeTabId: tabId,
                    scrapeWindowId: win.id,
                });
                sendResponse({ tabId });
            }
        );
        return true;
    }
});
