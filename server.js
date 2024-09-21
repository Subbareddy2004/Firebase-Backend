require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('pg');
const axios = require('axios');
const NodeCache = require('node-cache');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// PostgreSQL client setup
const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

// Attempt to connect to the database
client.connect()
    .then(() => console.log('Connected to PostgreSQL database'))
    .catch(err => {
        console.error('Error connecting to PostgreSQL database:', err);
        process.exit(1); // Exit the process if we can't connect to the database
    });

// Cache setup
const cache = new NodeCache({ stdTTL: 3600 });
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Endpoint to fetch menu items
app.get('/api/menu', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM menu');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching menu:', error);
        res.status(500).json({ error: 'Error fetching menu', details: error.message });
    }
});

// New endpoint to fetch filtered menu items
app.get('/api/menu/filter', async (req, res) => {
    const { filter } = req.query;
    try {
        let query = 'SELECT * FROM menu';
        if (filter) {
            query += ` WHERE LOWER(name) LIKE LOWER('%${filter}%') OR LOWER(category) LIKE LOWER('%${filter}%') OR LOWER(description) LIKE LOWER('%${filter}%')`;
        }
        const result = await client.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching filtered menu:', error);
        res.status(500).json({ error: 'Error fetching filtered menu', details: error.message });
    }
});

// Endpoint to handle chat messages
app.post('/api/chat', async (req, res) => {
    const { prompt } = req.body;
    const cachedAnswer = cache.get(prompt);
    if (cachedAnswer) {
        return res.json({ response: cachedAnswer });
    }

    try {
        // Fetch menu items from the database
        const result = await client.query('SELECT * FROM menu');
        const menuItems = result.rows;

        // Prepare the prompt for Gemini API
        const geminiPrompt = `You are an AI assistant for a restaurant. The user says: "${prompt}". Here's our menu: ${JSON.stringify(menuItems)}. Please help the user order by suggesting items, answering questions about the menu, or assisting with their order. If they want to order, confirm the items and total price.`;

        // Call Gemini API
        const geminiResponse = await axios.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
            contents: [{
                parts: [{
                    text: geminiPrompt
                }]
            }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': GEMINI_API_KEY
            }
        });

        const responseText = geminiResponse.data.candidates[0].content.parts[0].text;

        // Cache the answer
        cache.set(prompt, responseText);
        res.json({ response: responseText });
    } catch (error) {
        console.error('Error processing request:', error.message);
        res.status(500).json({ error: 'Failed to process request', details: error.message });
    }
});

// New endpoint to get AI-recommended menu items
app.post('/api/menu/recommend', async (req, res) => {
    const { prompt } = req.body;
    try {
        // Fetch all menu items
        const result = await client.query('SELECT * FROM menu');
        const menuItems = result.rows;

        // Prepare the prompt for Gemini API
        const geminiPrompt = `You are an AI assistant for a restaurant. The user says: "${prompt}". Here's our menu: ${JSON.stringify(menuItems)}. Please recommend suitable menu items based on the user's request. Return only the IDs of the recommended items as a JSON array. Do not include any additional text or formatting in your response, just the JSON array.`;

        // Call Gemini API
        const geminiResponse = await axios.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
            contents: [{
                parts: [{
                    text: geminiPrompt
                }]
            }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': GEMINI_API_KEY
            }
        });

        const responseText = geminiResponse.data.candidates[0].content.parts[0].text;
        
        // Clean up the response text
        const cleanedResponse = responseText.replace(/```json|```/g, '').trim();
        
        let recommendedIds;
        try {
            recommendedIds = JSON.parse(cleanedResponse);
        } catch (parseError) {
            console.error('Error parsing AI response:', parseError);
            // If parsing fails, return all menu items
            return res.json(menuItems);
        }

        if (!Array.isArray(recommendedIds)) {
            console.error('AI did not return an array of IDs');
            // If the response is not an array, return all menu items
            return res.json(menuItems);
        }

        // Fetch the recommended items from the database
        const recommendedItems = await client.query('SELECT * FROM menu WHERE id = ANY($1)', [recommendedIds]);
        
        res.json(recommendedItems.rows);
    } catch (error) {
        console.error('Error recommending menu items:', error);
        res.status(500).json({ error: 'Error recommending menu items', details: error.message });
    }
});

// Instead of app.listen(), export the app
module.exports = app;
