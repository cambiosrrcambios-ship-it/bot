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

        // Filtro de ahorro: Solo procesa si hay números
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
                    content: `Eres el cotizador de Remesas RyR. 
                    Tasa Base (B2): ${tBase}
                    Tasa >60k (C2): ${t60k}
                    Tasa >250k (D2): ${t250k}
                    Tasa BCV (F2): ${tBCV}

                    INSTRUCCIONES DE CÁLCULO ESTRICTAS:

                    1. SI PREGUNTAN POR DÓLARES (USD):
                       - Paso A (Pesos): (Monto_USD * ${tBCV}) / Tasa_Excel = Envías CLP.
                       - Paso B (Bolívares): Monto_USD * ${tBCV} = Reciben BS.

                    2. SI PREGUNTAN POR BOLÍVARES (BS):
                       - Paso A (Pesos): Monto_BS / Tasa_Excel = Envías CLP.
                       - Paso B (Dólares): Monto_BS / ${tBCV} = Equivalente USD.

                    3. SI PREGUNTAN POR PESOS (CLP):
                       - Paso A (Bolívares): Monto_CLP * Tasa_Excel = Reciben BS.
                       - Paso B (Dólares): Resultado_BS / ${tBCV} = Equivalente USD.

                    *PARA ELEGIR TASA_EXCEL:* Calcula primero cuántos CLP resultan. 
                    Si es menos de 60.000 usa ${tBase}. 
                    Si es entre 60.000 y 249.999 usa ${t60k}. 
                    Si es 250.000 o más usa ${t250k}.

                    FORMATO DE RESPUESTA:
                    ✅ *Cotización RyR*
                    💰 **Monto solicitado:** [Monto original]
                    ---
                    🇨🇱 **Envías:** [Monto] CLP
                    📈 **Tasa aplicada:** [Tasa]
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
        return res.json({ replies: [{ message: respuestaIA }] });

    } catch (e) {
        return res.json({ replies: [] });
    }
});

app.listen(process.env.PORT || 10000);