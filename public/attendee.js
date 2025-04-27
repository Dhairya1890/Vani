let socket = io();
let attendeeInfo = {
    name: '',
    language: ''
};
let currentSession = null;
let ttsEnabled = false;
let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;

// Initialize socket connection
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('join-success', () => {
    document.querySelector('.join-section').style.display = 'none';
    document.querySelector('.session-section').style.display = 'block';
});

socket.on('join-error', (error) => {
    alert(error);
});

socket.on('message', (data) => {
    const messageList = document.getElementById('messageList');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${data.type}`;
    
    if (data.type === 'speaker') {
        messageDiv.textContent = data.message;
        // Speak the message if TTS is enabled
        if (ttsEnabled) {
            speakText(data.message);
        }
    } else if (data.type === 'attendee') {
        messageDiv.textContent = `${data.senderName}: ${data.message}`;
    }
    
    messageList.appendChild(messageDiv);
    messageList.scrollTop = messageList.scrollHeight;
});

function toggleTTS() {
    ttsEnabled = !ttsEnabled;
    const ttsButton = document.getElementById('ttsButton');
    const ttsIcon = ttsButton.querySelector('.tts-icon');
    
    if (ttsEnabled) {
        ttsButton.classList.add('active');
        ttsIcon.textContent = '🔊';
        // Speak the last message if there is one
        const lastMessage = document.querySelector('.message.speaker:last-child');
        if (lastMessage) {
            speakText(lastMessage.textContent);
        }
    } else {
        ttsButton.classList.remove('active');
        ttsIcon.textContent = '🔇';
        // Stop any ongoing speech
        if (currentUtterance) {
            speechSynthesis.cancel();
        }
    }
}

function speakText(text) {
    if (currentUtterance) {
        speechSynthesis.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = attendeeInfo.language;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    currentUtterance = utterance;
    speechSynthesis.speak(utterance);
}

function saveAttendeeInfo() {
    const name = document.getElementById('attendeeName').value.trim();
    const language = document.getElementById('languageSelect').value;
    
    if (!name || !language) {
        alert('Please enter your name and select your language');
        return;
    }

    attendeeInfo = { name, language };
    
    // Disable the input fields
    document.getElementById('attendeeName').disabled = true;
    document.getElementById('languageSelect').disabled = true;
    document.querySelector('.attendee-info button').disabled = true;
}

function joinSession() {
    const sessionCode = document.getElementById('sessionCode').value.trim();
    
    if (!sessionCode) {
        alert('Please enter a session code');
        return;
    }

    if (!attendeeInfo.name || !attendeeInfo.language) {
        alert('Please save your information first');
        return;
    }

    socket.emit('attendee-join', {
        roomCode: sessionCode,
        language: attendeeInfo.language,
        attendeeName: attendeeInfo.name
    });

    currentSession = sessionCode;
}

function sendQuestion() {
    const questionInput = document.getElementById('questionInput');
    const question = questionInput.value.trim();
    
    if (question && currentSession) {
        socket.emit('attendee-question', {
            room: currentSession,
            message: question,
            language: attendeeInfo.language,
            attendeeName: attendeeInfo.name
        });
        questionInput.value = '';
    }
}

// Add event listener for Enter key in question input
document.addEventListener('DOMContentLoaded', () => {
    const questionInput = document.getElementById('questionInput');
    questionInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            sendQuestion();
        }
    });
}); 