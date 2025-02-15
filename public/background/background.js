// Background service worker
self.addEventListener('install', (event) => {
    console.log('Vision Assist extension installed');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Vision Assist extension activated');
    event.waitUntil(clients.claim());
});

// Track which tabs have the content script
const initializedTabs = new Set();

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'contentScriptLoaded') {
        initializedTabs.add(sender.tab.id);
        sendResponse({ status: 'acknowledged' });
    }
});

// Handle messages from popup
chrome.runtime.onConnect.addListener((port) => {
    console.log('Connection established with', port.name);
    
    port.onMessage.addListener(async (message) => {
        if (message.type === 'request_injection') {
            await injectContentScript(message.tabId);
        }
    });
    
    port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
            console.log('Connection error:', chrome.runtime.lastError);
        }
    });
});

async function injectContentScript(tabId) {
    if (!initializedTabs.has(tabId)) {
        try {
            // Inject CSS first
            await chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: ['public/content/content.css']
            });

            // Then inject the content script
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['public/content/content.js']
            });

            // Wait for initialization
            return new Promise((resolve) => {
                setTimeout(resolve, 1000);
            });
        } catch (error) {
            console.error('Error injecting content script:', error);
            throw error;
        }
    }
}

async function handleAction(action, settings = { rate: 1 }) {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs[0]) return;

        const tabId = tabs[0].id;

        // Check if content script is initialized
        if (!initializedTabs.has(tabId)) {
            await injectContentScript(tabId);
        }

        // Send the message to content script
        await chrome.tabs.sendMessage(tabId, { 
            action: action,
            settings: settings
        });
    } catch (error) {
        console.error('Error in handleAction:', error);
        // Re-throw to let caller handle it
        throw error;
    }
}

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
    if (command === 'start-reading') {
        handleAction('startReading');
    } else if (command === 'pause-reading') {
        handleAction('pauseReading');
    }
});

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        initializedTabs.delete(tabId);
    }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
    initializedTabs.delete(tabId);
}); 