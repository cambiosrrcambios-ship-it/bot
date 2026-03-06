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

        if (!/\d/.test(userMsg) && !userMsg.toLowerCase().includes("tasa")) {
             return res.json({ replies: [] });
        }

        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const col = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const tBase = parseFloat(col[1].replace(',', '.'));
        const t60k = parseFloat(col[2].replace(',', '.'));
        const t250k = parseFloat(col[3].replace(',', '.'));
        const tBCV = parseFloat(col[5].replace(',', '.'));

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `Eres un sistema de cotización automático para Remesas RyR. 
                    NO des explicaciones, NO pongas "Paso A" o "Paso B". Solo entrega el formato final.

                    TASAS: Base:${tBase}, >60k:${t60k}, >250k:${t250k}, BCV:${tBCV}.

                    MATEMÁTICA INTERNA:
                    - Si piden CLP: BS = CLP * Tasa_Excel | USD = BS / BCV.
                    - Si piden BS: CLP = BS / Tasa_Excel | USD = BS / BCV.
                    - Si piden USD: BS = USD * BCV | CLP = BS / Tasa_Excel.

                    REGLA DE TASA:
                    Calcula el monto en CLP. Si CLP < 60000 usa ${tBase}. Si CLP >= 60000 usa ${t60k}. Si CLP >= 250000 usa ${t250k}.

                    RESPONDE EXCLUSIVAMENTE ASÍ:
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

        let respuestaIA = completion.choices[0].message.content;
        return res.json({ replies: [{ message: respuestaIA }] });

    } catch (e) {
        return res.json({ replies: [] });
    }
});

app.listen(process.env.PORT || 10000);