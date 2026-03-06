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

        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const col = filas[1].split(filas[1].includes(';') ? ';' : ',');

        // Preparamos las variables del Excel para la IA
        const tasaBase = parseFloat(col[1]);
        const tasa60k = parseFloat(col[2]);
        const tasa250k = parseFloat(col[3]);
        const tasaBCV = parseFloat(col[5]);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    // REEMPLAZA SOLO EL BLOQUE DEL "content" DENTRO DE messages:
content: `Eres el experto de Remesas RyR. 
DATOS DE HOY: Base:${tasaBase}, 60k:${tasa60k}, 250k:${tasa250k}, BCV:${tasaBCV}.

REGLAS MATEMÁTICAS ESTRICTAS:
1. SI PIDEN BOLÍVARES (BS):
   - Envías (CLP) = Monto_BS / Tasa_Excel (Usa ${tasaBase} si es < 60k).
   - Equivalente (USD) = Monto_BS / ${tasaBCV}.

2. SI PIDEN PESOS (CLP):
   - Reciben (BS) = Monto_CLP * Tasa_Excel.
   - Equivalente (USD) = (Monto_CLP * Tasa_Excel) / ${tasaBCV}.

3. SI PIDEN DÓLARES (USD):
   - Reciben (BS) = Monto_USD * ${tasaBCV}.
   - Envías (CLP) = (Monto_USD * ${tasaBCV}) / Tasa_Excel.

FORMATO DE RESPUESTA:
✅ *Cotización RyR*
💰 **Monto solicitado:** [Monto original]
---
🇨🇱 **Envías:** [Monto] CLP
📈 **Tasa aplicada:** [Tasa_Excel]
💵 **Equivalente:** [Monto] USD
🇻🇪 **Reciben:** [Monto] Bs.
---
¿Deseas los datos para transferir?`
                },
                { role: "user", content: userMsg }
            ],
            temperature: 0
        });

        const respuestaIA = completion.choices[0].message.content;
        if (respuestaIA.includes("IGNORE_MESSAGE")) return res.json({ replies: [] });

        return res.json({ replies: [{ message: respuestaIA }] });

    } catch (e) {
        return res.json({ replies: [] });
    }
});

app.listen(process.env.PORT || 10000);