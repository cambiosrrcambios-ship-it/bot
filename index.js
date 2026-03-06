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
                    content: `Eres el experto en Remesas RyR. Solo respondes sobre remesas. 
                    Si el mensaje es un saludo, responde amable. Si no es sobre remesas, responde: IGNORE_MESSAGE.

                    TUS HERRAMIENTAS (Tasas de hoy):
                    - Tasa Base: ${tasaBase}
                    - Tasa >60k: ${tasa60k}
                    - Tasa >250k: ${tasa250k}
                    - Tasa BCV (Dólar): ${tasaBCV}

                    TUS FÓRMULAS OBLIGATORIAS:
                    1. SI PREGUNTAN EN PESOS (CLP):
                       - Cantidad USD = (Monto CLP * Tasa_Excel) / Tasa_BCV.
                       - Cantidad Bs = (Monto CLP * Tasa_Excel).
                    
                    2. SI PREGUNTAN EN BOLÍVARES (BS):
                       - Cantidad USD = Monto BS / Tasa_BCV.
                       - Cantidad CLP = Monto BS / Tasa_Excel. (Usa la tasa según el monto resultante en CLP).

                    3. SI PREGUNTAN EN DÓLARES (USD/$):
                       - Cantidad BS = Monto USD * Tasa_BCV.
                       - Cantidad CLP = (Monto USD * Tasa_BCV) / Tasa_Excel.

                    FORMATO DE RESPUESTA:
                    ✅ *Cotización RyR*
                    💰 **Monto solicitado:** [Monto original]
                    ---
                    🇨🇱 **Envías:** [Resultado] CLP
                    📈 **Tasa aplicada:** [La que usaste]
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
        if (respuestaIA.includes("IGNORE_MESSAGE")) return res.json({ replies: [] });

        return res.json({ replies: [{ message: respuestaIA }] });

    } catch (e) {
        return res.json({ replies: [] });
    }
});

app.listen(process.env.PORT || 10000);