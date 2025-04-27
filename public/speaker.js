console.log('Speaker.js loaded');

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioStream = null;
let socket = io();
let speakerInfo = {
    name: '',
    sessionName: ''
};

// Speech Recognition setup
let recognition = null;
let fullTranscript = '';

function initializeSpeechRecognition() {
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = async (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
                const sentence = result[0].transcript.trim();
                fullTranscript += sentence + ' ';
                console.log('[Final]:', sentence);

                // Show interim results in subtitles
                updateSubtitles(sentence);

                // Send for translation
                await sendForTranslation(sentence);
            } else {
                interim += result[0].transcript;
                // Show interim results in subtitles
                updateSubtitles(interim, true);
            }
        }
    };

    recognition.onend = () => {
        if (isRecording) {
            recognition.start();
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
            // Restart if no speech detected
            if (isRecording) {
                recognition.start();
            }
        }
    };
}

async function sendForTranslation(text) {
    try {
        const roomCode = document.getElementById('roomCode').textContent;
        if (roomCode === 'Waiting...') {
            throw new Error('Session code not available');
        }

        const response = await fetch(`/api/translate?room=${roomCode}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                text: text,
                speakerName: speakerInfo.name
            })
        });

        if (!response.ok) {
            throw new Error('Translation failed');
        }
    } catch (error) {
        console.error('Translation error:', error);
    }
}

function updateSubtitles(text, isInterim = false) {
    const subtitleDisplay = document.getElementById('subtitleDisplay');
    const subtitleElement = document.createElement('div');
    subtitleElement.className = `subtitle-text ${isInterim ? 'interim' : ''}`;
    subtitleElement.textContent = text;
    
    // Add the new subtitle
    subtitleDisplay.appendChild(subtitleElement);
    
    // Scroll to the bottom
    subtitleDisplay.scrollTop = subtitleDisplay.scrollHeight;
    
    // Remove old subtitles after 10 seconds
    setTimeout(() => {
        subtitleElement.style.opacity = '0';
        setTimeout(() => {
            subtitleDisplay.removeChild(subtitleElement);
        }, 300);
    }, 10000);
}

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    const roomCode = document.getElementById('roomCode').textContent;
    
    if (message && roomCode !== 'Waiting...') {
        // Send the message
        socket.emit('speaker-message', {
            room: roomCode,
            message: message,
            speakerName: speakerInfo.name
        });

        // Show the message in the message list
        const messageList = document.getElementById('messageList');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message speaker';
        messageDiv.textContent = message;
        messageList.appendChild(messageDiv);
        messageList.scrollTop = messageList.scrollHeight;

        // Clear the input
        messageInput.value = '';
    }
}

async function toggleRecording() {
    try {
        if (!isRecording) {
            // Check if room code is available before starting recording
            const roomCode = document.getElementById('roomCode').textContent;
            if (roomCode === 'Waiting...') {
                alert('Please save your speaker information first to get a session code.');
                return;
            }

            // Initialize speech recognition if not already done
            if (!recognition) {
                initializeSpeechRecognition();
            }

            // Start recording
            recognition.start();
            isRecording = true;
            document.querySelector('.mic-button').classList.add('recording');
            document.querySelector('.recording-status').style.display = 'flex';
            fullTranscript = ''; // Reset transcript
        } else {
            // Stop recording
            if (recognition) {
                recognition.stop();
            }
            isRecording = false;
            document.querySelector('.mic-button').classList.remove('recording');
            document.querySelector('.recording-status').style.display = 'none';
        }
    } catch (error) {
        console.error('Error in toggleRecording:', error);
        alert('Error toggling recording. Please try again.');
    }
}

// Initialize socket connection
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('room-code', (code) => {
    document.getElementById('roomCode').textContent = code;
});

socket.on('message', (data) => {
    const messageList = document.getElementById('messageList');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${data.type}`;
    
    // Create message content with name and timestamp
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    // Add sender name and timestamp
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header';
    messageHeader.innerHTML = `
        <span class="sender-name">${data.senderName}</span>
        <span class="message-time">${data.timestamp}</span>
    `;
    
    // Add message text
    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.textContent = data.message;
    
    // Assemble message
    messageContent.appendChild(messageHeader);
    messageContent.appendChild(messageText);
    messageDiv.appendChild(messageContent);
    
    // Add to message list
    messageList.appendChild(messageDiv);
    messageList.scrollTop = messageList.scrollHeight;
});

function saveSpeakerInfo() {
    const name = document.getElementById('speakerName').value.trim();
    const sessionName = document.getElementById('sessionName').value.trim();
    
    if (!name || !sessionName) {
        alert('Please enter both your name and session name');
        return;
    }

    speakerInfo = { name, sessionName };
    
    // Join room after saving info
    socket.emit('speaker-join', speakerInfo);
    
    // Disable the input fields
    document.getElementById('speakerName').disabled = true;
    document.getElementById('sessionName').disabled = true;
    document.querySelector('.speaker-info button').disabled = true;
}

// Add event listener for Enter key in message input
document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    messageInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    });
}); 