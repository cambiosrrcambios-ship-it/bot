const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

app.post('/', async (req, res) => {
    try {
        const userMsg = req.body.query?.message || req.body.message || req.body.text || "";
        if (!userMsg) return res.json({ replies: [] });

        // --- FILTRO DE AHORRO ---
        if (!/\d/.test(userMsg)) {
            return res.json({ replies: [] }); 
        }

        // 1. OBTENER TASAS
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const col = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const tBase = parseFloat(col[1].replace(',', '.'));
        const t60k = parseFloat(col[2].replace(',', '.'));
        const t250k = parseFloat(col[3].replace(',', '.'));
        const tBCV = parseFloat(col[5].replace(',', '.'));

        // 2. CONSULTA A LA IA
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `Eres el cotizador de Remesas RyR. Tasas: Base:${tBase}, >60k:${t60k}, >250k:${t250k}, BCV:${tBCV}.
                    Si el mensaje no es de dinero o tasas, responde: IGNORE.
                    
                    MATEMÁTICA:
                    - BS a CLP: Monto_BS / Tasa_Excel.
                    - BS a USD: Monto_BS / ${tBCV}.
                    - CLP a BS: Monto_CLP * Tasa_Excel.
                    - USD a BS: Monto_USD * ${tBCV}.
                    - USD a CLP: (Monto_USD * ${tBCV}) / Tasa_Excel.

                    FORMATO:
                    ✅ *Cotización RyR*
                    💰 **Monto solicitado:** [Monto original]
                    ---
                    🇨🇱 **Envías:** [Resultado] CLP
                    📈 **Tasa aplicada:** [Tasa]
                    💵 **Equivalente:** [Resultado] USD
                    🇻🇪 **Reciben:** [Resultado] Bs.
                    ---
                    ¿Deseas los datos para transferir?`
                },
                { role: "user", content: userMsg }
            ],
            temperature: 0
        });

        const respuestaIA = completion.choices[0].message.content;

        if (respuestaIA.includes("IGNORE")) {
            return res.json({ replies: [] });
        }

        return res.json({ replies: [{ message: respuestaIA }] });

    } catch (e) {
        return res.json({ replies: [] });
    }
});

app.listen(process.env.PORT || 10000);