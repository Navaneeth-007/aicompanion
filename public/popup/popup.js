document.addEventListener('DOMContentLoaded', async () => {
    const startReadingBtn = document.getElementById('startReading');
    const pauseReadingBtn = document.getElementById('pauseReading');
    const describeImagesBtn = document.getElementById('describeImages');
    const speechRateInput = document.getElementById('speechRate');
    const rateValue = document.getElementById('rateValue');
    const voiceSelect = document.getElementById('voiceSelect');
    const statusText = document.getElementById('statusText');

    let isReading = false;
    let voices = [];
    let port = null;

    // Initialize connection with background script
    try {
        port = chrome.runtime.connect({ name: 'popup' });
        port.onDisconnect.addListener(() => {
            console.log('Disconnected from background script');
            statusText.textContent = 'Connection lost. Please refresh the page.';
        });
    } catch (error) {
        console.error('Failed to connect to background script:', error);
        statusText.textContent = 'Failed to initialize. Please refresh the page.';
    }

    // Initialize voice options
    function loadVoices() {
        try {
            voices = window.speechSynthesis.getVoices();
            voiceSelect.innerHTML = '';
            
            // Add default option
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Default Voice';
            voiceSelect.appendChild(defaultOption);
            
            // Sort voices: English first, then others
            const englishVoices = voices.filter(voice => voice.lang.startsWith('en-'));
            const otherVoices = voices.filter(voice => !voice.lang.startsWith('en-'));
            
            // Add English voices first
            englishVoices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.name;
                option.textContent = `${voice.name} (${voice.lang})`;
                option.selected = voice.default;
                voiceSelect.appendChild(option);
            });
            
            // Add separator if there are both English and other voices
            if (englishVoices.length > 0 && otherVoices.length > 0) {
                const separator = document.createElement('option');
                separator.disabled = true;
                separator.textContent = '──────────';
                voiceSelect.appendChild(separator);
            }
            
            // Add other voices
            otherVoices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.name;
                option.textContent = `${voice.name} (${voice.lang})`;
                voiceSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading voices:', error);
            statusText.textContent = 'Error loading voices. Please refresh.';
        }
    }

    // Load voices when they're ready
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    loadVoices(); // Initial load

    // Save voice selection
    voiceSelect.addEventListener('change', async () => {
        try {
            const selectedVoice = voices.find(v => v.name === voiceSelect.value);
            await chrome.storage.local.set({ 
                selectedVoice: voiceSelect.value,
                selectedVoiceLang: selectedVoice?.lang || 'en-US'
            });
        } catch (error) {
            console.error('Error saving voice selection:', error);
            statusText.textContent = 'Error saving voice selection.';
        }
    });

    // Load saved voice
    try {
        const result = await chrome.storage.local.get(['selectedVoice']);
        if (result.selectedVoice) {
            voiceSelect.value = result.selectedVoice;
        }
    } catch (error) {
        console.error('Error loading saved voice:', error);
    }

    // Update speech rate display
    speechRateInput.addEventListener('input', async (e) => {
        try {
            const rate = e.target.value;
            rateValue.textContent = `${rate}x`;
            await chrome.storage.local.set({ speechRate: rate });
        } catch (error) {
            console.error('Error saving speech rate:', error);
        }
    });

    // Load saved speech rate
    try {
        const result = await chrome.storage.local.get(['speechRate']);
        if (result.speechRate) {
            speechRateInput.value = result.speechRate;
            rateValue.textContent = `${result.speechRate}x`;
        }
    } catch (error) {
        console.error('Error loading saved speech rate:', error);
    }

    // Helper function to send messages to content script
    async function sendMessageToContentScript(message) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                throw new Error('No active tab found');
            }
            
            // Try to ping the content script first
            try {
                await chrome.tabs.sendMessage(tab.id, { type: 'ping' });
            } catch (error) {
                console.log('Content script not ready, requesting injection...');
                // Request the background script to inject the content script
                if (port) {
                    port.postMessage({ type: 'request_injection', tabId: tab.id });
                    // Wait for injection
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            // Send the actual message
            await chrome.tabs.sendMessage(tab.id, message);
        } catch (error) {
            console.error('Error sending message:', error);
            statusText.textContent = 'Error: Could not communicate with page. Please refresh.';
            throw error;
        }
    }

    // Start reading page content
    startReadingBtn.addEventListener('click', async () => {
        if (!isReading) {
            try {
                isReading = true;
                statusText.textContent = 'Reading page content...';
                
                await sendMessageToContentScript({
                    action: 'startReading',
                    settings: {
                        rate: speechRateInput.value,
                        voice: voiceSelect.value,
                        voiceLang: voices.find(v => v.name === voiceSelect.value)?.lang || 'en-US'
                    }
                });
            } catch (error) {
                isReading = false;
                console.error('Error starting reading:', error);
            }
        }
    });

    // Pause reading
    pauseReadingBtn.addEventListener('click', async () => {
        try {
            isReading = false;
            statusText.textContent = 'Paused';
            await sendMessageToContentScript({ action: 'pauseReading' });
        } catch (error) {
            console.error('Error pausing reading:', error);
        }
    });

    // Describe images on the page
    describeImagesBtn.addEventListener('click', async () => {
        try {
            statusText.textContent = 'Analyzing images...';
            await sendMessageToContentScript({ action: 'describeImages' });
        } catch (error) {
            console.error('Error describing images:', error);
            statusText.textContent = 'Error analyzing images. Please try again.';
        }
    });

    // Listen for status updates from content script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'status') {
            statusText.textContent = message.text;
            if (message.text === 'Finished reading page' || message.text === 'Reading paused') {
                isReading = false;
            }
        }
    });
}); 