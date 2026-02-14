// Content script that runs on myapps.microsoft.com
// Waits for the SPA to render app tiles, then scrapes and sends them to the extension

(function () {
    "use strict";

    function findIcon(el) {
        // Look for an img inside or near the link
        const img = el.querySelector("img");
        if (img && img.src) return img.src;

        // Look for a background-image on child elements
        const children = el.querySelectorAll("*");
        for (const child of children) {
            const bg = getComputedStyle(child).backgroundImage;
            if (bg && bg !== "none") {
                const match = bg.match(/url\(["']?(.*?)["']?\)/);
                if (match && match[1]) return match[1];
            }
        }

        // Check parent tile/card for an icon
        const parent = el.closest('[class*="tile"], [class*="card"], [role="listitem"]');
        if (parent) {
            const parentImg = parent.querySelector("img");
            if (parentImg && parentImg.src) return parentImg.src;
        }

        return "";
    }

    function scrapeApps() {
        const apps = [];
        const seen = new Set();

        // The MyApps portal renders app tiles as links with aria-labels
        document.querySelectorAll("a").forEach((a) => {
            const href = a.href || "";
            if (
                !href.includes("launcher.myapps.microsoft.com") &&
                !href.includes("/signin/") &&
                !href.includes("myapplications.microsoft.com")
            ) {
                return;
            }

            const name =
                a.getAttribute("aria-label") ||
                a.textContent?.trim() ||
                "";

            if (name && name.length > 1 && name.length < 150 && !seen.has(name)) {
                seen.add(name);
                apps.push({ name, url: href, icon: findIcon(a) });
            }
        });

        // Fallback: look for any elements with app-like structure
        if (apps.length === 0) {
            document.querySelectorAll('[role="listitem"] a, [role="option"] a').forEach((a) => {
                const name = a.textContent?.trim() || a.getAttribute("aria-label") || "";
                const href = a.href || "";
                if (name && name.length > 1 && name.length < 150 && !seen.has(name)) {
                    seen.add(name);
                    apps.push({ name, url: href, icon: findIcon(a) });
                }
            });
        }

        return apps;
    }

    function tryScrapeAndSend() {
        const apps = scrapeApps();
        if (apps.length > 0) {
            chrome.runtime.sendMessage({ type: "APPS_SCRAPED", apps });
            return true;
        }
        return false;
    }

    // Try immediately
    if (tryScrapeAndSend()) return;

    // Use MutationObserver to wait for the SPA to render
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max

    const observer = new MutationObserver(() => {
        attempts++;
        if (tryScrapeAndSend() || attempts >= maxAttempts) {
            observer.disconnect();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    // Also poll as a fallback (some SPA changes don't trigger mutations)
    const interval = setInterval(() => {
        attempts++;
        if (tryScrapeAndSend() || attempts >= maxAttempts) {
            clearInterval(interval);
            observer.disconnect();
        }
    }, 1000);
})();
