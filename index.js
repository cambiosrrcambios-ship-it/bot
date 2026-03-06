const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const app = express();
app.use(express.json());

// Aquí el bot busca la llave de forma SEGURA
const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY 
});

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

app.post('/', async (req, res) => {
    try {
        const query = req.body.query || {};
        const userMsg = query.message || req.body.message || "";

        // 1. LEER EXCEL
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const columnas = filas[1].split(filas[1].includes(';') ? ';' : ',');
        const infoExcel = `Tasas: Base ${columnas[1]}, 60k ${columnas[2]}, 250k ${columnas[3]}, BCV ${columnas[5]}`;

        // 2. CHATGPT RESPONDE
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `Eres asistente de remesas RyR. Datos: ${infoExcel}. Calcula montos y responde amablemente.` },
                { role: "user", content: userMsg }
            ]
        });

        res.json({ replies: [{ message: completion.choices[0].message.content }] });
    } catch (e) {
        res.json({ replies: [{ message: "Lo siento, intenta de nuevo." }] });
    }
});

app.listen(process.env.PORT || 10000);