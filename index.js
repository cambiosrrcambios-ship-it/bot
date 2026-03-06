const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

app.post('/', async (req, res) => {
    try {
        const query = req.body.query || {};
        const userMsg = query.message || req.body.message || "";

        // 1. OBTENER TASAS DEL EXCEL
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const col = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const infoTasas = `
        TASAS RYR DE HOY:
        - Menos de 60,000 CLP: Tasa ${col[1]}
        - Desde 60,000 CLP: Tasa ${col[2]}
        - Desde 250,000 CLP: Tasa ${col[3]}
        - Dólar BCV: ${col[5]} BS/USD
        `;

        // 2. INSTRUCCIONES REFORZADAS
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `Eres el experto en cambios de Remesas RyR. 
                    DATOS: ${infoTasas}.

                    INSTRUCCIONES DE INTERPRETACIÓN:
                    - "mil" o "k" equivalen a 000 (Ej: "20 mil" = 20000).
                    - "luka" o "luca" equivalen a 1000 CLP.
                    - Si el usuario dice "20mil bs", entiende que son 20,000 Bolívares.

                    INSTRUCCIONES DE CÁLCULO:
                    - Si piden BS: Primero divide BS / BCV para tener USD. Luego calcula cuántos CLP se necesitan para esos USD usando la tasa del Excel.
                    - Si piden USD: Calcula cuántos CLP se necesitan y cuántos BS recibirá.
                    - SIEMPRE indica el monto en PESOS CHILENOS (CLP) que el cliente debe pagar.

                    FORMATO DE RESPUESTA:
                    ✅ *Cotización RyR*
                    💰 **Monto:** [Monto solicitado]
                    ---
                    🇨🇱 **Envías:** [Monto] CLP
                    📈 **Tasa:** [Tasa usada]
                    💵 **Equivalente:** [Monto] USD
                    🇻🇪 **Reciben:** [Monto] Bs.
                    ---
                    ¿Te gustaría que te envíe los datos de transferencia?`
                },
                { role: "user", content: userMsg }
            ],
            temperature: 0
        });

        res.json({ replies: [{ message: completion.choices[0].message.content }] });

    } catch (e) {
        res.json({ replies: [{ message: "Hola! Por favor indica el monto y la moneda para cotizarte de inmediato. Ejemplo: 20 mil pesos." }] });
    }
});

app.listen(process.env.PORT || 10000);