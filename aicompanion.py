import os
import sys
from transformers import pipeline
import speech_recognition as sr
import pyttsx3
import cv2
import numpy as np
from PIL import Image, ImageGrab
import pytesseract
from bs4 import BeautifulSoup
import requests
import mss
import layoutparser as lp
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager


class AIAssistant:
    def __init__(self):
        try:
            # Initialize speech recognition
            self.recognizer = sr.Recognizer()
            
            # Initialize text-to-speech
            self.speaker = pyttsx3.init()
            
            # Initialize vision models
            try:
                self.image_analyzer = pipeline("image-to-text")
            except Exception as e:
                print(f"Warning: Failed to initialize image analyzer: {e}")
                self.image_analyzer = None
            
            # Initialize OCR engine
            if sys.platform.startswith('win'):
                pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
            self.ocr_engine = pytesseract
            
            # Initialize layout model with error handling
            try:
                self.layout_model = lp.Detectron2LayoutModel(
                    config_path='lp://PubLayNet/mask_rcnn_X_101_32x8d_FPN_3x/config',
                    label_map={0: "Text", 1: "Title", 2: "List", 3: "Table", 4: "Figure"}
                )
            except Exception as e:
                print(f"Warning: Failed to initialize layout model: {e}")
                self.layout_model = None
            
            # Initialize web driver for DOM access with options
            chrome_options = Options()
            chrome_options.add_argument('--headless')  # Run in headless mode
            chrome_options.add_argument('--disable-gpu')
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            
            try:
                service = Service(ChromeDriverManager().install())
                self.driver = webdriver.Chrome(service=service, options=chrome_options)
            except Exception as e:
                print(f"Warning: Failed to initialize Chrome driver: {e}")
                self.driver = None
            
            # Initialize screen capture
            try:
                self.screen_capture = mss.mss()
            except Exception as e:
                print(f"Warning: Failed to initialize screen capture: {e}")
                self.screen_capture = None
                
        except Exception as e:
            print(f"Error initializing AI Assistant: {e}")
            self.cleanup()
            raise

    def capture_screen(self):
        """Capture current screen content"""
        if self.screen_capture is None:
            raise RuntimeError("Screen capture not initialized")
            
        try:
            # Capture the entire screen
            monitor = self.screen_capture.monitors[1]  # Primary monitor
            screenshot = self.screen_capture.grab(monitor)
            # Convert to PIL Image
            img = Image.frombytes('RGB', screenshot.size, screenshot.rgb)
            # Convert to numpy array for processing
            img_array = np.array(img)
            return img, img_array
        except Exception as e:
            print(f"Error capturing screen: {e}")
            return None, None

    def analyze_layout(self, image):
        """
        Analyze page layout and structure
        Returns a dictionary containing layout information
        """
        try:
            # Convert image to format expected by layout parser
            if isinstance(image, np.ndarray):
                image = Image.fromarray(image)

            # Detect layout elements
            layout_result = self.layout_model.detect(image)

            # Get DOM structure if available (for web pages)
            dom_structure = self.analyze_dom()

            # Initialize layout analysis results
            layout_analysis = {
                'sections': [],
                'navigation': None,
                'main_content': None,
                'sidebar': None,
                'header': None,
                'footer': None
            }

            # Process layout elements
            for block in layout_result:
                coords = block.coordinates
                block_type = block.type
                confidence = block.score

                # Create section info
                section_info = {
                    'type': block_type,
                    'location': {
                        'x1': int(coords[0]),
                        'y1': int(coords[1]),
                        'x2': int(coords[2]),
                        'y2': int(coords[3])
                    },
                    'confidence': float(confidence)
                }

                # Determine section type based on position and content
                if block_type == "Title" and coords[1] < image.height * 0.2:
                    layout_analysis['header'] = section_info
                elif block_type == "List" and coords[0] < image.width * 0.2:
                    layout_analysis['navigation'] = section_info
                elif block_type == "Text" and coords[1] > image.height * 0.8:
                    layout_analysis['footer'] = section_info
                else:
                    layout_analysis['sections'].append(section_info)

            # Combine with DOM information if available
            if dom_structure:
                layout_analysis['dom'] = dom_structure

            return layout_analysis

        except Exception as e:
            self.speak(f"Error analyzing layout: {str(e)}")
            return None

    def analyze_dom(self):
        """Analyze DOM structure of current webpage"""
        try:
            # Get current page source
            page_source = self.driver.page_source
            soup = BeautifulSoup(page_source, 'html.parser')

            # Initialize DOM structure
            dom_structure = {
                'headings': [],
                'links': [],
                'forms': [],
                'lists': [],
                'tables': []
            }

            # Extract headings
            for heading in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
                dom_structure['headings'].append({
                    'level': heading.name,
                    'text': heading.text.strip()
                })

            # Extract links
            for link in soup.find_all('a'):
                dom_structure['links'].append({
                    'text': link.text.strip(),
                    'href': link.get('href', '')
                })

            # Extract forms
            for form in soup.find_all('form'):
                form_info = {
                    'inputs': [],
                    'buttons': []
                }
                for input_field in form.find_all('input'):
                    form_info['inputs'].append({
                        'type': input_field.get('type', ''),
                        'name': input_field.get('name', ''),
                        'placeholder': input_field.get('placeholder', '')
                    })
                dom_structure['forms'].append(form_info)

            return dom_structure

        except Exception as e:
            print(f"Error analyzing DOM: {str(e)}")
            return None

    def generate_description(self, layout, text):
        """
        Generate natural language description of screen content
        Returns a structured description of the page
        """
        try:
            description_parts = []
            # Describe page structure
            if layout.get('header'):
                description_parts.append("At the top of the page, there's a header section.")

            if layout.get('navigation'):
                nav_description = "There's a navigation menu"
                if layout['navigation']['location']['x1'] < 100:
                    nav_description += " on the left side"
                elif layout['navigation']['location']['x1'] > 500:
                    nav_description += " on the right side"
                description_parts.append(nav_description + ".")

            # Describe main content
            if layout.get('sections'):
                main_content_desc = []
                for section in layout['sections']:
                    if section['type'] == "Text":
                        main_content_desc.append("a text section")
                    elif section['type'] == "Figure":
                        main_content_desc.append("an image")
                    elif section['type'] == "Table":
                        main_content_desc.append("a table")
                    elif section['type'] == "List":
                        main_content_desc.append("a list")

                if main_content_desc:
                    description_parts.append(f"The main content area contains {', '.join(main_content_desc)}.")

            # Add DOM-specific information if available
            if layout.get('dom'):
                dom = layout['dom']
                if dom.get('headings'):
                    main_heading = dom['headings'][0]['text']
                    description_parts.append(f"The main heading is '{main_heading}'.")

                if dom.get('links'):
                    num_links = len(dom['links'])
                    description_parts.append(f"There are {num_links} clickable links on the page.")

                if dom.get('forms'):
                    num_forms = len(dom['forms'])
                    description_parts.append(f"The page contains {num_forms} form{'s' if num_forms > 1 else ''}.")

            # Add extracted text summary if available
            if text:
                # Truncate text if too long
                text_summary = text[:200] + "..." if len(text) > 200 else text
                description_parts.append(f"The main text content begins with: {text_summary}")

            # Combine all parts into final description
            final_description = " ".join(description_parts)
            return final_description

        except Exception as e:
            return f"Error generating description: {str(e)}"

    def listen_for_command(self):
        """Listen for voice commands from user"""
        with sr.Microphone() as source:
            self.speak("Listening for command...")
            audio = self.recognizer.listen(source)
            try:
                command = self.recognizer.recognize_google(audio)
                return self.process_command(command)
            except sr.UnknownValueError:
                return "Could not understand audio"

    def process_command(self, command):
        """Process voice commands and route to appropriate handler"""
        if "describe screen" in command.lower():
            return self.describe_screen()
        elif "read text" in command.lower():
            return self.extract_text()
        elif "describe image" in command.lower():
            return self.analyze_image()
        return f"Command not recognized: {command}"

    def describe_screen(self):
        """Capture and analyze current screen content"""
        # Capture screen
        img, img_array = self.capture_screen()
        if img is None:
            return "Failed to capture screen"

        # Analyze layout
        layout = self.analyze_layout(img_array)
        if layout is None:
            return "Failed to analyze layout"

        # Extract text
        text = self.extract_text(img)

        # Generate and speak description
        description = self.generate_description(layout, text)
        self.speak(description)
        return description

    def analyze_image(self, image=None):
        """Analyze image content using vision model"""
        if image is None:
            image, _ = self.capture_screen()
        description = self.image_analyzer(image)
        return self.speak(description)

    def speak(self, text):
        """Convert text to speech"""
        self.speaker.say(text)
        self.speaker.runAndWait()
        return text

    def extract_text(self, image=None):
        """Extract text from screen or image using OCR"""
        if image is None:
            image, _ = self.capture_screen()
        text = self.ocr_engine.image_to_string(image)
        return text

    def cleanup(self):
        """Clean up resources"""
        try:
            if hasattr(self, 'driver') and self.driver:
                self.driver.quit()
            if hasattr(self, 'screen_capture') and self.screen_capture:
                self.screen_capture.close()
            if hasattr(self, 'speaker') and self.speaker:
                self.speaker.stop()
        except Exception as e:
            print(f"Error during cleanup: {e}")


def main():
    try:
        assistant = AIAssistant()
        print("AI Assistant initialized successfully")
        while True:
            try:
                assistant.listen_for_command()
            except KeyboardInterrupt:
                print("\nStopping AI Assistant...")
                break
            except Exception as e:
                print(f"Error during command processing: {e}")
    finally:
        if 'assistant' in locals():
            assistant.cleanup()


if __name__ == "__main__":
    main()
