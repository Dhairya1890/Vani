// Initialize Socket.IO connection
const socket = io();

// Check if we're on the teacher or student page
const isTeacher = document.querySelector('.room-info') !== null;
let currentRoom = null;

if (isTeacher) {
    // Teacher-specific code
    socket.emit('teacher-join');
    
    socket.on('room-code', (code) => {
        currentRoom = code;
        document.getElementById('roomCode').textContent = code;
    });
} else {
    // Student-specific code
    const joinSection = document.getElementById('joinSection');
    const classroomSection = document.getElementById('classroomSection');
    const joinError = document.getElementById('joinError');
    
    window.joinRoom = () => {
        const roomCode = document.getElementById('roomCodeInput').value.toUpperCase();
        const language = document.getElementById('languageSelect').value;
        
        if (roomCode.length === 6) {
            socket.emit('student-join', { roomCode, language });
        } else {
            joinError.textContent = 'Please enter a valid 6-character code';
        }
    };
    
    socket.on('join-success', () => {
        currentRoom = document.getElementById('roomCodeInput').value.toUpperCase();
        joinSection.style.display = 'none';
        classroomSection.style.display = 'block';
    });
    
    socket.on('join-error', (error) => {
        joinError.textContent = error;
    });
}

// Common message handling
socket.on('message', (data) => {
    const messageList = document.getElementById('messageList');
    const messageElement = document.createElement('div');
    messageElement.className = `message ${data.type}`;
    
    // Add translation indicator if needed
    if (!data.original) {
        messageElement.innerHTML = `
            <div class="message-content">${data.message}</div>
            <div class="message-meta">(Translated)</div>
        `;
    } else {
        messageElement.textContent = data.message;
    }
    
    messageList.appendChild(messageElement);
    messageList.scrollTop = messageList.scrollHeight;
});

// Teacher message sending
window.sendMessage = () => {
    if (!isTeacher) return;
    
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (message && currentRoom) {
        socket.emit('teacher-message', {
            room: currentRoom,
            message: message
        });
        messageInput.value = '';
    }
};

// Student doubt sending
window.sendDoubt = () => {
    if (isTeacher) return;
    
    const doubtInput = document.getElementById('doubtInput');
    const message = doubtInput.value.trim();
    const language = document.getElementById('languageSelect').value;
    
    if (message && currentRoom) {
        socket.emit('student-doubt', {
            room: currentRoom,
            message: message,
            language: language
        });
        doubtInput.value = '';
    }
}; 