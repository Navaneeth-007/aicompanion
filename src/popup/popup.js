document.addEventListener('DOMContentLoaded', () => {
    const startReadingBtn = document.getElementById('startReading');
    const pauseReadingBtn = document.getElementById('pauseReading');
    const describeImagesBtn = document.getElementById('describeImages');
    const speechRateInput = document.getElementById('speechRate');
    const rateValue = document.getElementById('rateValue');
    const voiceSelect = document.getElementById('voiceSelect');
    const statusText = document.getElementById('statusText');

    let isReading = false;

    // Initialize voice options
    function loadVoices() {
        const voices = window.speechSynthesis.getVoices();
        voiceSelect.innerHTML = '';
        voices.forEach((voice) => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });
    }

    // Load voices when they're ready
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // Update speech rate display
    speechRateInput.addEventListener('input', (e) => {
        rateValue.textContent = `${e.target.value}x`;
    });

    // Start reading page content
    startReadingBtn.addEventListener('click', async () => {
        if (!isReading) {
            isReading = true;
            statusText.textContent = 'Reading page content...';
            
            // Send message to content script to start reading
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.sendMessage(tab.id, {
                action: 'startReading',
                settings: {
                    rate: speechRateInput.value,
                    voice: voiceSelect.value
                }
            });
        }
    });

    // Pause reading
    pauseReadingBtn.addEventListener('click', async () => {
        isReading = false;
        statusText.textContent = 'Paused';
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, { action: 'pauseReading' });
    });

    // Describe images on the page
    describeImagesBtn.addEventListener('click', async () => {
        statusText.textContent = 'Analyzing images...';
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, { action: 'describeImages' });
    });

    // Listen for status updates from content script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'status') {
            statusText.textContent = message.text;
        }
    });
}); 