const axios = require('axios');
require('dotenv').config();

// Check if API key is loaded
console.log("API Key loaded:", process.env.GROQ_API_KEY ? 'Yes' : 'No');

// Groq API configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Available languages for translation
const AVAILABLE_LANGUAGES = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'hi': 'Hindi',
    'de': 'German',
    'it': 'Italian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'pt': 'Portuguese',
    'ru': 'Russian'
};

/**
 * Translates text to the target language using Groq API
 * @param {string} text - The text to translate
 * @param {string} targetLanguage - The target language code
 * @returns {Promise<string>} - The translated text
 */
async function translateText(text, targetLanguage) {
    try {
        if (!text || typeof text !== 'string') {
            throw new Error('Invalid text input');
        }

        console.log(`Translating to ${AVAILABLE_LANGUAGES[targetLanguage]}: "${text}"`);
        
        const requestBody = {
            model: 'llama3-70b-8192',
            messages: [
                {
                    role: 'system',
                    content: `You are a translator. Translate the following text to ${AVAILABLE_LANGUAGES[targetLanguage]}. Only return the translated text.`
                },
                {
                    role: 'user',
                    content: text
                }
            ],
            temperature: 0.1,
            max_tokens: 1024
        };

        console.log('Request body:', JSON.stringify(requestBody, null, 2));

        const response = await axios.post(GROQ_API_URL, requestBody, {
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Groq API Response:', JSON.stringify(response.data, null, 2));

        if (!response.data || !response.data.choices || !response.data.choices.length) {
            throw new Error('Invalid or empty response from Groq API');
        }

        if (!response.data.choices[0] || !response.data.choices[0].message || !response.data.choices[0].message.content) {
            throw new Error('Invalid response format from Groq API');
        }

        const translatedText = response.data.choices[0].message.content.trim();
        console.log(`Translation result: "${translatedText}"`);
        return translatedText;
    } catch (error) {
        console.error('Translation error details:', {
            message: error.message,
            response: error.response ? {
                status: error.response.status,
                data: error.response.data,
                headers: error.response.headers
            } : 'No response data'
        });
        
        // Return a more user-friendly error message
        return `[Translation Error] ${text}`;
    }
}

/**
 * Translates a message to all target languages
 * @param {string} message - The message to translate
 * @param {Map} studentLangMap - Map of student socket IDs to their selected languages
 * @returns {Promise<Map>} - Map of student socket IDs to their translated messages
 */
async function translateMessageToAllLanguages(message, studentLangMap) {
    if (!message || typeof message !== 'string') {
        console.error('Invalid message input:', message);
        return new Map();
    }

    const translations = new Map();
    
    for (const [studentId, language] of studentLangMap) {
        if (!language || !AVAILABLE_LANGUAGES[language]) {
            console.error(`Invalid language for student ${studentId}:`, language);
            continue;
        }
        const translatedText = await translateText(message, language);
        translations.set(studentId, translatedText);
    }
    
    return translations;
}

module.exports = {
    translateText,
    translateMessageToAllLanguages,
    AVAILABLE_LANGUAGES
}; 