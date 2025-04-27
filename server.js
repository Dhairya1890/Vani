const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const { translateText, translateMessageToAllLanguages, AVAILABLE_LANGUAGES } = require('./translate');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config();

// Groq API configuration
const GROQ_API_URL = 'https://api.groq.com/openai/v1';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve the main pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'speaker.html'));
});

app.get('/attendee', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'attendee.html'));
});

// Generate random 6-character alphanumeric code
function generateRoomCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}

// Store active rooms and their participants
const activeRooms = new Map();

// Add retry logic for API calls
async function makeApiCallWithRetry(apiCall, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await apiCall();
        } catch (error) {
            lastError = error;
            console.error(`API call failed (attempt ${i + 1}/${maxRetries}):`, error.message);
            if (i < maxRetries - 1) {
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            }
        }
    }
    throw lastError;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected');

    // Handle speaker connection
    socket.on('speaker-join', (speakerInfo) => {
        const roomCode = generateRoomCode();
        socket.join(roomCode);
        socket.emit('room-code', roomCode);
        activeRooms.set(roomCode, {
            speaker: socket.id,
            speakerName: speakerInfo.name,
            sessionName: speakerInfo.sessionName,
            attendees: new Map()
        });
        console.log(`Speaker ${speakerInfo.name} joined session: ${roomCode}`);
    });

    // Handle attendee connection
    socket.on('attendee-join', async (data) => {
        const { roomCode, language, attendeeName } = data;
        const room = activeRooms.get(roomCode);
        
        if (room) {
            socket.join(roomCode);
            room.attendees.set(socket.id, { 
                language,
                name: attendeeName
            });
            socket.emit('join-success');
            console.log(`Attendee ${attendeeName} joined session: ${roomCode} with language: ${language}`);
            
            // Send welcome message in attendee's language
            try {
                const welcomeMessage = await translateText(`Welcome to ${room.sessionName}, ${attendeeName}!`, language);
                socket.emit('message', {
                    type: 'speaker',
                    message: welcomeMessage,
                    original: false,
                    senderName: room.speakerName
                });
            } catch (error) {
                console.error('Welcome message translation failed:', error);
            }
        } else {
            socket.emit('join-error', 'Invalid session code');
        }
    });

    // Handle speaker message
    socket.on('speaker-message', async (data) => {
        const { room, message, speakerName } = data;
        const roomData = activeRooms.get(room);
        
        if (roomData) {
            // Send original message to speaker
            io.to(roomData.speaker).emit('message', {
                type: 'speaker',
                message: message,
                original: true,
                senderName: speakerName,
                timestamp: new Date().toLocaleTimeString()
            });

            // Create a map of attendee IDs to their languages
            const attendeeLangMap = new Map();
            for (const [attendeeId, attendeeData] of roomData.attendees) {
                attendeeLangMap.set(attendeeId, attendeeData.language);
            }

            try {
                // Translate message to all attendee languages
                const translations = await makeApiCallWithRetry(async () => {
                    return await translateMessageToAllLanguages(message, attendeeLangMap);
                });

                // Send translated messages to each attendee
                for (const [attendeeId, translatedMessage] of translations) {
                    io.to(attendeeId).emit('message', {
                        type: 'speaker',
                        message: translatedMessage,
                        original: false,
                        senderName: speakerName,
                        timestamp: new Date().toLocaleTimeString()
                    });
                }
            } catch (error) {
                console.error('Translation failed:', error);
                // Notify speaker of translation failure
                io.to(roomData.speaker).emit('message', {
                    type: 'system',
                    message: 'Translation service is currently unavailable. Please try again later.',
                    original: true,
                    timestamp: new Date().toLocaleTimeString()
                });
            }
        }
    });

    // Handle attendee question
    socket.on('attendee-question', async (data) => {
        const { room, message, language, attendeeName } = data;
        const roomData = activeRooms.get(room);
        
        if (roomData) {
            try {
                // Translate question to English for speaker
                const translatedQuestion = await makeApiCallWithRetry(async () => {
                    return await translateText(message, 'en');
                });
                
                // Send translated question to speaker
                io.to(roomData.speaker).emit('message', {
                    type: 'attendee',
                    message: translatedQuestion,
                    original: false,
                    senderName: attendeeName,
                    timestamp: new Date().toLocaleTimeString()
                });

                // Send original question to attendee
                io.to(socket.id).emit('message', {
                    type: 'attendee',
                    message: message,
                    original: true,
                    senderName: attendeeName,
                    timestamp: new Date().toLocaleTimeString()
                });
            } catch (error) {
                console.error('Translation failed for attendee question:', error);
                // Notify both speaker and attendee of translation failure
                io.to(roomData.speaker).emit('message', {
                    type: 'system',
                    message: `[Translation Error] Question from ${attendeeName}`,
                    original: false,
                    timestamp: new Date().toLocaleTimeString()
                });
                io.to(socket.id).emit('message', {
                    type: 'system',
                    message: 'Translation service is currently unavailable. Please try again later.',
                    original: true,
                    timestamp: new Date().toLocaleTimeString()
                });
            }
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected');
        // Clean up room data if needed
        for (const [roomCode, roomData] of activeRooms) {
            if (roomData.speaker === socket.id) {
                activeRooms.delete(roomCode);
            } else {
                roomData.attendees.delete(socket.id);
            }
        }
    });
});

app.post('/api/transcribe', upload.single('file'), async (req, res) => {
    let tempFilePath;
    try {
        if (!req.file) {
            console.error('No file received');
            return res.status(400).json({ error: 'No audio file provided' });
        }

        // Get the room code from the request
        const roomCode = req.query.room;
        if (!roomCode || roomCode === 'Waiting...') {
            return res.status(400).json({ error: 'Invalid room code' });
        }

        const roomData = activeRooms.get(roomCode);
        if (!roomData) {
            return res.status(400).json({ error: 'Room not found' });
        }

        console.log('Received audio chunk:', {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
        });

        // Create a temporary file
        tempFilePath = path.join(__dirname, 'temp_audio.webm');
        fs.writeFileSync(tempFilePath, req.file.buffer);

        // Create a read stream from the file
        const fileStream = fs.createReadStream(tempFilePath);

        // Create form data for the request
        const formData = new FormData();
        formData.append('file', fileStream);
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('response_format', 'json');
        formData.append('language', 'en'); // Specify English as the source language
        formData.append('temperature', '0.2'); // Lower temperature for more accurate transcription

        // Get the transcription
        console.log('Sending request to Groq API for chunk transcription...');
        const startTime = Date.now();
        const transcriptionResponse = await axios.post(
            `${GROQ_API_URL}/audio/transcriptions`,
            formData,
            {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    ...formData.getHeaders()
                }
            }
        );
        console.log(`Chunk transcription completed in ${Date.now() - startTime}ms`);
        console.log('Chunk transcription received:', transcriptionResponse.data);

        // Get the transcribed text
        const transcribedText = transcriptionResponse.data.text;

        // Send original text to speaker for subtitles
        io.to(roomData.speaker).emit('subtitle', {
            text: transcribedText,
            timestamp: Date.now()
        });

        // Translate and send to attendees
        for (const [attendeeId, attendeeData] of roomData.attendees) {
            try {
                const translation = await translateText(transcribedText, attendeeData.language);
                io.to(attendeeId).emit('subtitle', {
                    text: translation,
                    timestamp: Date.now()
                });
            } catch (error) {
                console.error(`Translation failed for attendee ${attendeeId}:`, error);
                // Don't fail the entire request if translation fails for one attendee
            }
        }

        res.json({ 
            text: transcribedText
        });
    } catch (error) {
        console.error('Transcription/Translation error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });

        // Send a more specific error message
        const errorMessage = error.response?.data?.error || error.message;
        res.status(500).json({ 
            error: 'Failed to process audio',
            details: errorMessage
        });
    } finally {
        // Clean up temporary file if it exists
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (cleanupError) {
                console.error('Error cleaning up temporary file:', cleanupError);
            }
        }
    }
});

// Add translation endpoint
app.post('/api/translate', express.json(), async (req, res) => {
    try {
        const { text, speakerName } = req.body;
        const roomCode = req.query.room;

        if (!text || !roomCode) {
            return res.status(400).json({ error: 'Missing text or room code' });
        }

        const roomData = activeRooms.get(roomCode);
        if (!roomData) {
            return res.status(400).json({ error: 'Room not found' });
        }

        // Send original text to speaker
        io.to(roomData.speaker).emit('message', {
            type: 'speaker',
            message: text,
            original: true,
            senderName: speakerName
        });

        // Translate and send to attendees
        for (const [attendeeId, attendeeData] of roomData.attendees) {
            try {
                const translation = await translateText(text, attendeeData.language);
                io.to(attendeeId).emit('message', {
                    type: 'speaker',
                    message: translation,
                    original: false,
                    senderName: speakerName
                });
            } catch (error) {
                console.error(`Translation failed for attendee ${attendeeId}:`, error);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Translation error:', error);
        res.status(500).json({ 
            error: 'Failed to process translation',
            details: error.message
        });
    }
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 
