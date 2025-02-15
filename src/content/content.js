class VisionAssistant {
    constructor() {
        this.speech = window.speechSynthesis;
        this.currentUtterance = null;
        this.isReading = false;
        this.currentNode = null;
        this.imageDescriptions = new Map();
        
        // Initialize Transformers.js for image analysis
        this.initializeImageAnalyzer();
    }

    async initializeImageAnalyzer() {
        try {
            // Load the model for image analysis
            const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.8.0');
            this.imageAnalyzer = await pipeline('image-to-text', 'Xenova/vit-gpt2-image-captioning');
        } catch (error) {
            console.error('Failed to initialize image analyzer:', error);
        }
    }

    async analyzeImage(imageUrl) {
        if (!this.imageAnalyzer) {
            return 'Image analysis not available';
        }

        try {
            const result = await this.imageAnalyzer(imageUrl);
            return result[0].generated_text;
        } catch (error) {
            console.error('Error analyzing image:', error);
            return 'Failed to analyze image';
        }
    }

    async describeImages() {
        const images = document.querySelectorAll('img');
        for (const image of images) {
            if (!this.imageDescriptions.has(image)) {
                const description = await this.analyzeImage(image.src);
                this.imageDescriptions.set(image, description);
                
                // Add ARIA description
                image.setAttribute('aria-label', description);
                image.setAttribute('role', 'img');
            }
        }
    }

    getReadableNodes() {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Skip hidden elements
                    if (node.parentElement.offsetParent === null) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // Skip empty text nodes
                    if (node.textContent.trim().length === 0) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const nodes = [];
        let node;
        while (node = walker.nextNode()) {
            nodes.push(node);
        }
        return nodes;
    }

    startReading(settings) {
        if (this.isReading) return;
        
        this.isReading = true;
        const nodes = this.getReadableNodes();
        
        if (!this.currentNode) {
            this.currentNode = nodes[0];
        }

        this.readNode(this.currentNode, settings);
    }

    readNode(node, settings) {
        if (!node || !this.isReading) return;

        let text = node.textContent.trim();
        
        // Check if node is near an image
        const nearbyImage = this.findNearbyImage(node);
        if (nearbyImage && this.imageDescriptions.has(nearbyImage)) {
            text += '. ' + this.imageDescriptions.get(nearbyImage);
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = parseFloat(settings.rate) || 1;
        
        if (settings.voice) {
            const voices = this.speech.getVoices();
            const selectedVoice = voices.find(voice => voice.name === settings.voice);
            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }
        }

        utterance.onend = () => {
            if (this.isReading) {
                const nodes = this.getReadableNodes();
                const currentIndex = nodes.indexOf(node);
                if (currentIndex < nodes.length - 1) {
                    this.currentNode = nodes[currentIndex + 1];
                    this.readNode(this.currentNode, settings);
                } else {
                    this.isReading = false;
                    this.currentNode = null;
                    chrome.runtime.sendMessage({ type: 'status', text: 'Finished reading page' });
                }
            }
        };

        this.currentUtterance = utterance;
        this.speech.speak(utterance);
    }

    findNearbyImage(node) {
        const element = node.parentElement;
        const rect = element.getBoundingClientRect();
        const nearby = document.elementsFromPoint(rect.left, rect.top);
        return nearby.find(el => el.tagName === 'IMG');
    }

    pauseReading() {
        this.isReading = false;
        if (this.speech.speaking) {
            this.speech.cancel();
        }
    }
}

// Initialize the assistant
const assistant = new VisionAssistant();

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'startReading':
            assistant.startReading(message.settings);
            break;
        case 'pauseReading':
            assistant.pauseReading();
            break;
        case 'describeImages':
            assistant.describeImages().then(() => {
                chrome.runtime.sendMessage({ 
                    type: 'status', 
                    text: 'Finished analyzing images' 
                });
            });
            break;
    }
}); 