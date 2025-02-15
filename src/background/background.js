// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('Vision Assist extension installed');
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
    if (command === 'start-reading') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { 
                action: 'startReading',
                settings: { rate: 1 }
            });
        });
    } else if (command === 'pause-reading') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'pauseReading' });
        });
    }
}); 