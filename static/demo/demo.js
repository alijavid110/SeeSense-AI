// Accessing DOM elements
const video = document.getElementById('cameraFeedVideo');
const canvas = document.getElementById('cameraCanvas');
const previewCanvas = document.createElement('canvas'); // Hidden canvas for live analysis preview
const previewContext = previewCanvas.getContext('2d', { willReadFrequently: true }); // Context for preview canvas
const capturedImage = document.getElementById('capturedImage');
const analyzeButton = document.getElementById('analyzeButton');
const analysisDisplay = document.getElementById('analysisDisplay');
const statusText = document.getElementById('statusText');
const statusDescription = document.getElementById('statusDescription');
const cameraIconContainer = document.getElementById('cameraIconContainer');
const cameraFeedText = document.getElementById('cameraFeedText');
const cameraAccessInfo = document.getElementById('cameraAccessInfo');
const statusDot = document.getElementById('statusDot');
const listeningIndicator = document.getElementById('listeningIndicator');

// Global state variables
let currentStream;
let recognition;
let isSpeaking = false;
let voices = [];
let cameraGuidanceActive = false;
let lastGuidanceTime = 0; // To throttle guidance messages
const GUIDANCE_INTERVAL = 5000; // Throttle guidance messages to every 5 seconds
let lastSpokenResponse = "";

// Loading available voices for SpeechSynthsis
function populateVoiceList() {
    voices = window.speechSynthesis.getVoices();
    console.log(voices);
}
populateVoiceList();

// Browser loading delay for voices
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoiceList;
}

// Speech synthesis function with callback
function speak(text, callback) {
    if ('speechSynthesis' in window) {
        lastSpokenResponse = text; // Store the last spoken text
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.rate = 1;

        const desiredVoiceName = "Microsoft Zira - English (United States)";
        const selectedVoice = voices.find(voice => voice.name === desiredVoiceName && voice.lang === utterance.lang);

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        } else {
            console.warn(`Desired voice "${desiredVoiceName}" not found. Using default.`);
        }
        
        // Changing the status indicators
        statusDot.classList.remove('listening');
        statusDot.classList.add('speaking');
        listeningIndicator.classList.remove('active');
        statusText.textContent = 'Speaking...';
        isSpeaking = true;

        utterance.onend = () => {
            statusDot.classList.remove('speaking');
            isSpeaking = false;
            if (callback) callback(); // Execute callback after speaking ends
        };
        utterance.onerror = (event) => {
            console.error('SpeechSynthesisUtterance.onerror', event);
            statusDot.classList.remove('speaking');
            isSpeaking = false;
            if (callback) callback(); // Execute callback even if there's an error
        };
        window.speechSynthesis.speak(utterance);
    } else {
        console.warn('SpeechSynthesis API not supported.');
        if (callback) callback();
    }
}

// Guidance procedure for camera system
function provideCameraGuidance() {
    if (!cameraGuidanceActive || isSpeaking || video.readyState < 2) {
        requestAnimationFrame(provideCameraGuidance);
        return;
    }

    const now = Date.now();
    if (now - lastGuidanceTime < GUIDANCE_INTERVAL) {
        requestAnimationFrame(provideCameraGuidance);
        return;
    }

    previewCanvas.width = video.videoWidth;
    previewCanvas.height = video.videoHeight;
    previewContext.save();
    previewContext.translate(previewCanvas.width, 0);
    previewContext.scale(-1, 1);
    previewContext.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height);
    previewContext.restore();

    const imageData = previewContext.getImageData(0, 0, previewCanvas.width, previewCanvas.height);
    const data = imageData.data;
    let brightnessSum = 0;
    let darkPixels = 0;
    let brightPixels = 0;
    const pixelCount = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = (r + g + b) / 3;
        brightnessSum += brightness;

        if (brightness < 50) darkPixels++;
        if (brightness > 200) brightPixels++;
    }

    const averageBrightness = brightnessSum / pixelCount;

    let guidanceMessage = null;

    if (averageBrightness < 80 && darkPixels > pixelCount * 0.7) {
        guidanceMessage = "It's quite dark. Try pointing towards a light source.";
    } else if (averageBrightness > 180 && brightPixels > pixelCount * 0.7) {
        guidanceMessage = "The scene appears very bright. Adjust your angle or find a less glary spot.";
    }

    if (guidanceMessage && statusDescription.textContent !== guidanceMessage) {
        lastGuidanceTime = now;
        statusDescription.textContent = guidanceMessage;
        // The callback here is crucial for resuming recognition correctly
        speak(guidanceMessage, () => {
            // Only restart recognition if Nova is not already speaking something else
            if (!isSpeaking) {
                startVoiceRecognition();
            }
        });
    } else if (!guidanceMessage && statusDescription.textContent.includes("Adjust")) {
        statusDescription.textContent = 'Voice control activated.';
    }

    requestAnimationFrame(provideCameraGuidance);
}

// Starting procedure for camera system
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        currentStream = stream;
        video.srcObject = stream;
        video.style.display = 'block';
        video.play();

        cameraIconContainer.style.display = 'none';
        cameraFeedText.style.display = 'none';
        cameraAccessInfo.style.display = 'none';
        capturedImage.style.display = 'none';

        statusText.textContent = 'Live camera feed active';

        speak('Voice control activated. Say "nova, describe", "nova, identify", "nova, read", or "nova, repeat" to begin.', () => {
            startVoiceRecognition();
            cameraGuidanceActive = true;
            requestAnimationFrame(provideCameraGuidance);
        });

    } catch (err) {
        console.error('Error accessing camera:', err);
        analysisDisplay.textContent = 'Error: Could not access camera. Please ensure you have a webcam and granted permission.';
        statusText.textContent = 'Camera access denied or failed';
        statusDescription.textContent = 'Please check camera permissions in your browser settings.';
        speak('Error: Could not access camera. Please ensure you have a webcam and granted permission.', startVoiceRecognition);
    }
}

// Shutdown procedure for camera system
function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        video.style.display = 'none';
        cameraGuidanceActive = false;
        if (capturedImage.style.display === 'none') {
            cameraIconContainer.style.display = 'flex';
            cameraFeedText.style.display = 'block';
            cameraAccessInfo.style.display = 'block';
        }
    }
}

// Image capture and analysis procedure
async function captureImage(commandType = 'describe') {
    if (!currentStream) {
        analysisDisplay.textContent = 'No camera feed active to capture from.';
        speak('No camera feed active to capture from.', startVoiceRecognition);
        return;
    }

    cameraGuidanceActive = false;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');

    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    context.setTransform(1, 0, 0, 1, 0, 0);

    const imageDataURL = canvas.toDataURL('image/png');

    capturedImage.src = imageDataURL;
    capturedImage.style.display = 'block';
    video.style.display = 'none';

    analysisDisplay.textContent = `Sending image for '${commandType}' analysis...`;
    statusText.textContent = 'Analyzing...';
    statusDescription.textContent = 'Please wait while the AI processes the image.';
    statusDot.classList.remove('listening');
    statusDot.classList.remove('speaking');
    listeningIndicator.classList.remove('active');

    if (recognition) {
        recognition.stop();
    }

    try {
        const response = await fetch('/analyze-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image: imageDataURL, command: commandType }),
        });

        if (!response.ok) {
            return response.json().then(errorData => {
                console.error('Server error details:', errorData);
                throw new Error(errorData.error || 'Server returned an error.');
            }).catch(() => {
                throw new Error(`Server responded with status: ${response.status} ${response.statusText}`);
            });
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.playbackRate = 1.2;

        statusDot.classList.remove('listening');
        statusDot.classList.add('speaking');
        listeningIndicator.classList.remove('active');
        statusText.textContent = 'Speaking analysis...';
        isSpeaking = true;

        audio.onended = async () => {
            console.log("Audio finished playing! Resuming camera feed and guidance.");
            analysisDisplay.textContent = 'Analysis complete. Audio feedback provided.';
            statusText.textContent = 'Analysis complete';
            statusDescription.textContent = 'Audio feedback provided by Gemini.';
            statusDot.classList.remove('speaking');
            isSpeaking = false;

            capturedImage.style.display = 'none';
            video.style.display = 'block';

            cameraGuidanceActive = true;
            requestAnimationFrame(provideCameraGuidance);
            startVoiceRecognition();

            try {
                const textResponse = await fetch('/get-last-spoken-text', { method: 'GET' });
                if (textResponse.ok) {
                    const data = await textResponse.json();
                    lastSpokenResponse = data.text;
                    console.log("Updated lastSpokenResponse from server:", lastSpokenResponse); // Log to verify
                } else {
                    console.error('Failed to get last spoken text:', textResponse.statusText);
                }
            } catch (error) {
                console.error('Error fetching last spoken text:', error);
            }
        };

        audio.onerror = (e) => {
            console.error("Error playing audio:", e);
            analysisDisplay.textContent = `Error playing audio: ${e.message || 'Unknown error'}`;
            statusText.textContent = 'Audio playback failed';
            statusDot.classList.remove('speaking');
            isSpeaking = false;

            capturedImage.style.display = 'none';
            video.style.display = 'block';

            cameraGuidanceActive = true;
            requestAnimationFrame(provideCameraGuidance);
            startVoiceRecognition();
        };

        audio.play().catch(playError => {
            console.error("Error calling audio.play():", playError);
            analysisDisplay.textContent = `Error initiating audio playback: ${playError.message}`;
            statusText.textContent = 'Audio playback failed';
            statusDot.classList.remove('speaking');
            isSpeaking = false;

            capturedImage.style.display = 'none';
            video.style.display = 'block';

            cameraGuidanceActive = true;
            requestAnimationFrame(provideCameraGuidance);
            startVoiceRecognition();
        });


    } catch (error) {
        console.error('Analysis error:', error);
        analysisDisplay.textContent = `Error during analysis: ${error.message}`;
        statusText.textContent = 'Analysis failed';
        statusDescription.textContent = 'Check console for details or try again.';
        statusDot.classList.remove('speaking');
        isSpeaking = false;

        capturedImage.style.display = 'none';
        video.style.display = 'block';

        cameraGuidanceActive = true;
        requestAnimationFrame(provideCameraGuidance);
        speak(`Analysis failed: ${error.message}`, startVoiceRecognition);
    }
}

// Voice recognition starting procedure
function startVoiceRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        alert("Web Speech API is not supported by this browser. Please use Chrome or Edge.");
        statusText.textContent = 'Voice control not supported';
        statusDescription.textContent = 'Update your browser or use manual controls.';
        return;
    }

    if (recognition) {
        recognition.stop();
    }

    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        console.log('Voice recognition started...');
        statusDot.classList.add('listening');
        listeningIndicator.classList.add('active');
        statusText.textContent = 'Listening for commands...';
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        console.log('RAW SPEECH DETECTED (lowercase):', transcript);
        statusText.textContent = `Heard: "${transcript}"`;

        if (recognition) {
            recognition.stop();
        }

        cameraGuidanceActive = false;

        if (transcript.includes('nova describe') || transcript.includes('describe')) {
            console.log('Command "nova describe" detected!');
            speak('Describing your surroundings.', () => {
                captureImage('describe');
            });
        } else if (transcript.includes('nova identify') || transcript.includes('nova identifier') || transcript.includes('identifier')) {
            console.log('Command "nova identify" detected!');
            speak('Identifying objects and people.', () => {
                captureImage('identify');
            });
        } else if (transcript.includes('nova read') || transcript.includes('read')) {
            console.log('Command "nova read" detected!');
            speak('Searching for text to read.', () => {
                captureImage('read');
            });
        } else if (transcript.includes('nova repeat') || transcript.includes('repeat')) {
            console.log('Command "nova repeat" detected!');
            if (lastSpokenResponse) {
                speak(lastSpokenResponse, () => {
                    // After repeating, always restart recognition
                    cameraGuidanceActive = true;
                    requestAnimationFrame(provideCameraGuidance);
                    startVoiceRecognition();
                });
            } else {
                speak("I haven't said anything yet.", () => {
                    // After saying nothing, always restart recognition
                    cameraGuidanceActive = true;
                    requestAnimationFrame(provideCameraGuidance);
                    startVoiceRecognition();
                });
            }
        } else {
            speak('Command not recognized. Please try again', () => {
                cameraGuidanceActive = true;
                requestAnimationFrame(provideCameraGuidance);
                startVoiceRecognition();
            });
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        statusDot.classList.remove('listening');
        listeningIndicator.classList.remove('active');
        statusText.textContent = 'Voice control error';
        statusDescription.textContent = `Error: ${event.error}. Click "Start Voice Control" to retry.`;

        if (event.error === 'no-speech' && !isSpeaking) {
            console.log('No speech detected, restarting recognition...');
            cameraGuidanceActive = true;
            requestAnimationFrame(provideCameraGuidance);
            startVoiceRecognition();
        } else if (event.error === 'aborted' && isSpeaking) {
            console.log('Recognition aborted while speaking, expected behavior.');
        } else if (event.error !== 'no-speech') {
            speak(`Speech recognition error: ${event.error}.`, () => {
                cameraGuidanceActive = true;
                requestAnimationFrame(provideCameraGuidance);
                startVoiceRecognition();
            });
        }
    };

    recognition.onend = () => {
        console.log('Voice recognition ended.');
        statusDot.classList.remove('listening');
        listeningIndicator.classList.remove('active');
        if (!isSpeaking) {
            console.log('Recognition ended and AI is not speaking, restarting automatically.');
            cameraGuidanceActive = true;
            requestAnimationFrame(provideCameraGuidance);
            startVoiceRecognition();
        } else {
            console.log('Recognition ended but AI is speaking, deferring restart.');
        }
    };

    // Ensure only one recognition instance is active at a time
    try {
        recognition.start();
    } catch (e) {
        if (e.name === 'InvalidStateError') {
            console.warn('Recognition already started, ignoring redundant start call.');
        } else {
            console.error('Error starting recognition:', e);
        }
    }
}

// Event listeners for buttons
analyzeButton.addEventListener('click', () => {
    if (video.style.display === 'block') {
        if (recognition) {
            recognition.stop();
        }
        cameraGuidanceActive = false;
        captureImage('describe');
    } else {
        stopCamera();
        startCamera();
    }
});

// Start camera on page load
window.addEventListener('load', startCamera);

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    stopCamera();
    if (recognition) recognition.stop();
    cameraGuidanceActive = false;
});