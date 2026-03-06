const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

app.post('/', async (req, res) => {
    try {
        // 1. CAPTURAR EL MENSAJE (Sin filtros de números)
        const userMsg = req.body.query?.message || req.body.message || req.body.text || "";
        
        if (!userMsg || userMsg.trim() === "") {
            return res.json({ replies: [] });
        }

        // 2. OBTENER TASAS DEL EXCEL
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const col = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const infoTasas = `
        TASAS RYR:
        - Base: ${col[1]}
        - 60k+: ${col[2]}
        - 250k+: ${col[3]}
        - BCV: ${col[5]}
        `;

        // 3. CHATGPT PROCESA TODO (Números y letras)
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `Eres el experto de Remesas RyR. 
                    DATOS: ${infoTasas}.
                    
                    ENTIENDE EL LENGUAJE:
                    - "mil", "k", "kilos" = 000 (Ej: 20mil = 20000).
                    - "luca", "luka" = 1000 CLP.
                    
                    REGLA DE CÁLCULO:
                    - Si piden Bolívares: Divide por BCV para sacar USD, luego calcula CLP.
                    - SIEMPRE indica cuánto debe enviar el cliente en PESOS CHILENOS (CLP).
                    
                    FORMATO:
                    ✅ *Cotización RyR*
                    💰 **Monto:** [Monto solicitado]
                    ---
                    🇨🇱 **Envías:** [Monto] CLP
                    📈 **Tasa:** [Tasa]
                    💵 **Equivalente:** [Monto] USD
                    🇻🇪 **Reciben:** [Monto] Bs.
                    ---
                    ¿Te envío los datos para el depósito?`
                },
                { role: "user", content: userMsg }
            ],
            temperature: 0
        });

        const respuestaIA = completion.choices[0].message.content;
        return res.json({ replies: [{ message: respuestaIA }] });

    } catch (e) {
        console.error("Error:", e);
        // Si no entiende el monto o algo falla, enviamos el mensaje de ayuda
        return res.json({ replies: [{ message: "⚠️ Por favor, indícame el monto y la moneda (ej: 20 mil pesos o 50 dólares) para darte el valor exacto." }] });
    }
});

app.listen(process.env.PORT || 10000);