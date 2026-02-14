const loadingDiv = document.getElementById("loading");
const mainDiv = document.getElementById("main");
const sectionListEl = document.getElementById("section-list");
const sectionTitleEl = document.getElementById("section-title");
const appsListEl = document.getElementById("apps-list");
const addSectionBtn = document.getElementById("add-section-btn");
const refreshBtn = document.getElementById("refresh-btn");
const renameBtn = document.getElementById("rename-btn");
const deleteBtn = document.getElementById("delete-btn");

const CACHE_TTL = 5 * 60 * 1000;
let data = { sections: [], activeSection: 0 };
let dragState = null;

addSectionBtn.addEventListener("click", () => {
    const name = prompt("Section name:");
    if (!name || !name.trim()) return;
    data.sections.push({ id: uid(), title: name.trim(), apps: [] });
    data.activeSection = data.sections.length - 1;
    save();
    render();
});

refreshBtn.addEventListener("click", () => triggerScrape());

renameBtn.addEventListener("click", () => {
    const section = data.sections[data.activeSection];
    if (!section) return;
    const name = prompt("Rename section:", section.title);
    if (!name || !name.trim()) return;
    section.title = name.trim();
    save();
    render();
});

deleteBtn.addEventListener("click", () => {
    if (data.sections.length <= 1) return;
    const sIdx = data.activeSection;
    const section = data.sections[sIdx];
    // Move apps to the first other section
    const target = data.sections[sIdx === 0 ? 1 : 0];
    target.apps.push(...section.apps);
    data.sections.splice(sIdx, 1);
    data.activeSection = Math.min(data.activeSection, data.sections.length - 1);
    save();
    render();
});

// Init: load layout or scrape
chrome.storage.local.get(["layout", "cachedApps", "cacheTime"], (result) => {
    if (result.layout && result.layout.sections && result.layout.sections.length > 0) {
        data = result.layout;
        if (data.activeSection == null) data.activeSection = 0;
        show();
    } else if (result.cachedApps && result.cachedApps.length > 0 && Date.now() - result.cacheTime < CACHE_TTL) {
        data = { sections: [{ id: uid(), title: "All Apps", apps: result.cachedApps }], activeSection: 0 };
        save();
        show();
    } else {
        triggerScrape();
    }
});

function show() {
    loadingDiv.classList.add("hidden");
    mainDiv.classList.remove("hidden");
    render();
}

function triggerScrape() {
    loadingDiv.textContent = "Loading your apps…";
    loadingDiv.classList.remove("hidden");
    mainDiv.classList.add("hidden");

    chrome.runtime.sendMessage({ type: "SCRAPE_APPS" }, () => {
        let elapsed = 0;
        const poll = setInterval(() => {
            elapsed += 1000;
            chrome.runtime.sendMessage({ type: "GET_APPS" }, (response) => {
                const { apps, cacheTime } = response || {};
                if (apps && apps.length > 0 && Date.now() - cacheTime < 30000) {
                    clearInterval(poll);
                    mergeNewApps(apps);
                    save();
                    show();
                    return;
                }
                if (elapsed >= 20000) {
                    clearInterval(poll);
                    loadingDiv.textContent = "Could not load apps. Make sure you're signed in to Microsoft in Edge.";
                }
            });
        }, 1000);
    });
}

function mergeNewApps(scrapedApps) {
    if (data.sections.length === 0) {
        // First time — put everything in "All Apps"
        data.sections = [{ id: uid(), title: "All Apps", apps: scrapedApps }];
        data.activeSection = 0;
        return;
    }

    // Find new apps not already in any section
    const existing = new Set();
    data.sections.forEach((s) => s.apps.forEach((a) => existing.add(a.name)));
    const newApps = scrapedApps.filter((a) => !existing.has(a.name));

    // Add new apps to the first section (no auto-creating sections)
    if (newApps.length > 0) {
        data.sections[0].apps.push(...newApps);
    }

    // Update icons for all existing apps
    const iconMap = {};
    scrapedApps.forEach((a) => { iconMap[a.name] = a.icon; });
    data.sections.forEach((s) => s.apps.forEach((a) => {
        if (iconMap[a.name]) a.icon = iconMap[a.name];
    }));
}

function save() {
    chrome.storage.local.set({ layout: data });
}

function uid() {
    return Math.random().toString(36).slice(2, 9);
}

function render() {
    renderSidebar();
    renderApps();
}

function renderSidebar() {
    sectionListEl.innerHTML = "";
    data.sections.forEach((section, idx) => {
        const li = document.createElement("li");
        li.className = "section-item" + (idx === data.activeSection ? " active" : "");
        li.textContent = section.title;
        li.addEventListener("click", () => {
            data.activeSection = idx;
            save();
            render();
        });

        // Allow dropping apps onto sidebar sections
        li.addEventListener("dragover", (e) => {
            e.preventDefault();
            li.style.outline = "2px solid #0078d4";
        });
        li.addEventListener("dragleave", () => {
            li.style.outline = "";
        });
        li.addEventListener("drop", (e) => {
            e.preventDefault();
            li.style.outline = "";
            if (!dragState) return;
            // Move app to this section
            const { sIdx: srcSIdx, aIdx: srcAIdx } = dragState;
            const [app] = data.sections[srcSIdx].apps.splice(srcAIdx, 1);
            data.sections[idx].apps.push(app);
            data.activeSection = idx;
            dragState = null;
            save();
            render();
        });

        sectionListEl.appendChild(li);
    });
}

function renderApps() {
    const section = data.sections[data.activeSection];
    if (!section) return;

    sectionTitleEl.textContent = section.title;
    appsListEl.innerHTML = "";

    // Drop zone on the list itself (for dropping into empty sections)
    appsListEl.ondragover = (e) => { e.preventDefault(); };
    appsListEl.ondrop = (e) => {
        e.preventDefault();
        if (!dragState) return;
        handleDrop(data.activeSection, section.apps.length);
    };

    if (section.apps.length === 0) {
        const msg = document.createElement("li");
        msg.className = "empty-msg";
        msg.textContent = "No apps in this section. Drag apps here from other sections.";
        appsListEl.appendChild(msg);
        return;
    }

    section.apps.forEach((app, aIdx) => {
        appsListEl.appendChild(createAppItem(app, data.activeSection, aIdx));
    });
}

function createAppItem(app, sIdx, aIdx) {
    const li = document.createElement("li");
    li.className = "app-item";
    li.draggable = true;

    // Drag handle
    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "⠿";
    li.appendChild(handle);

    // Icon
    if (app.icon) {
        const img = document.createElement("img");
        img.src = app.icon;
        img.className = "app-icon";
        img.alt = "";
        img.onerror = () => {
            const ph = document.createElement("span");
            ph.className = "app-icon-placeholder";
            ph.textContent = app.name.charAt(0).toUpperCase();
            img.replaceWith(ph);
        };
        li.appendChild(img);
    } else {
        const ph = document.createElement("span");
        ph.className = "app-icon-placeholder";
        ph.textContent = app.name.charAt(0).toUpperCase();
        li.appendChild(ph);
    }

    // Link
    const a = document.createElement("a");
    a.href = app.url || "#";
    a.className = "app-link";
    a.textContent = app.name;
    a.target = "_blank";
    li.appendChild(a);

    // Drag events
    li.addEventListener("dragstart", (e) => {
        dragState = { sIdx, aIdx };
        li.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
    });

    li.addEventListener("dragend", () => {
        li.classList.remove("dragging");
        dragState = null;
        clearIndicators();
    });

    li.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearIndicators();
        const rect = li.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
            li.classList.add("drag-above");
        } else {
            li.classList.add("drag-below");
        }
    });

    li.addEventListener("dragleave", () => {
        li.classList.remove("drag-above", "drag-below");
    });

    li.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearIndicators();
        if (!dragState) return;
        const rect = li.getBoundingClientRect();
        const insertIdx = e.clientY < rect.top + rect.height / 2 ? aIdx : aIdx + 1;
        handleDrop(sIdx, insertIdx);
    });

    return li;
}

function handleDrop(targetSIdx, targetAIdx) {
    if (!dragState) return;
    const { sIdx: srcSIdx, aIdx: srcAIdx } = dragState;
    const [app] = data.sections[srcSIdx].apps.splice(srcAIdx, 1);
    let insertAt = targetAIdx;
    if (srcSIdx === targetSIdx && srcAIdx < targetAIdx) insertAt--;
    data.sections[targetSIdx].apps.splice(insertAt, 0, app);
    dragState = null;
    save();
    render();
}

function clearIndicators() {
    document.querySelectorAll(".drag-above, .drag-below").forEach((el) => {
        el.classList.remove("drag-above", "drag-below");
    });
}
