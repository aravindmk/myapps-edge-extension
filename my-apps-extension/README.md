# MyApps Launcher — Edge Extension

Quick access to your Microsoft MyApps applications from the Edge toolbar. No Azure AD registration or API keys needed.

## Features

- Lists all your assigned apps from myapps.microsoft.com
- Organize apps into custom sections
- Drag-to-reorder apps within and across sections
- App icons scraped from the portal
- Results cached locally for fast access
- Uses your existing browser session — no extra sign-in

## Install

1. Open `edge://extensions`
2. Enable Developer mode
3. Click Load unpacked → select this folder

## How It Works

The extension opens myapps.microsoft.com in a hidden window, waits for the SPA to render, scrapes your app tiles (names, URLs, icons), then closes the window. Your layout and sections are saved in local storage.

## Project Structure

```
manifest.json        Extension config (Manifest V3)
background.js        Service worker — scrape orchestration, messaging
content-script.js    Runs on myapps.microsoft.com — scrapes app tiles
popup/
  popup.html         Sidebar + app list layout
  popup.js           Sections, drag-and-drop, rendering
  popup.css          Styles
icons/               Extension icons (16, 48, 128px)
```
