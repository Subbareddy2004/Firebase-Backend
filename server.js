const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ... (keep existing imports and setup)

function parseRecommendedMenu(response, fullMenu) {
    const lines = response.split('\n');
    const recommendedItems = [];

    for (const line of lines) {
        const match = line.match(/\d+\.\s+\*\*(.*?)\*\*/);
        if (match) {
            recommendedItems.push(match[1].toLowerCase().trim());
        }
    }

    console.log('Recommended items:', recommendedItems);

    const filteredMenu = fullMenu.filter(item => 
        recommendedItems.some(recommendedItem => 
            item.productTitle.toLowerCase().includes(recommendedItem)
        )
    );

    console.log('Filtered menu:', filteredMenu);

    return filteredMenu;
}

app.post('/api/chat', async (req, res) => {
    try {
        const { message, menu } = req.body;

        const model = genAI.getGenerativeModel({ model: "gemini-pro"});

        const prompt = `You are a food ordering chatbot. The user's message is: "${message}". Here's the menu: ${JSON.stringify(menu)}. Recommend dishes based on the user's message and the available menu items. Format your response as a numbered list with the recommended dishes in bold, including their prices.`;

        const result = await model.generateContent(prompt);
        const response = result.response.text();

        console.log('Gemini response:', response);

        const recommendedMenu = parseRecommendedMenu(response, menu);

        console.log('Recommended menu:', recommendedMenu);

        res.json({ response, recommendedMenu });
    } catch (error) {
        console.error('Error processing chat:', error);
        res.status(500).json({ error: 'An error occurred while processing your request.' });
    }
});

// Remove the app.listen part, as Vercel will handle this

module.exports = app;