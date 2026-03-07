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

        // 1. Obtener Tasas del Excel
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const col = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const tBase = parseFloat(col[1].replace(',', '.'));
        const t60k = parseFloat(col[2].replace(',', '.'));
        const t250k = parseFloat(col[3].replace(',', '.'));
        const tBCV = parseFloat(col[5].replace(',', '.'));

        // 2. Extracción de datos con IA
        const extraction = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Extrae monto y moneda. Responde solo JSON: {\"monto\": 10, \"moneda\": \"USD\"}. Monedas: CLP, BS, USD." },
                { role: "user", content: userMsg }
            ],
            temperature: 0
        });

        const data = JSON.parse(extraction.choices[0].message.content);
        let montoOriginal = data.monto;
        let monedaOriginal = data.moneda;
        
        let clp, bs, usd, tasaExcelUsada;

        // 3. LÓGICA MATEMÁTICA
        if (monedaOriginal === "USD") {
            bs = montoOriginal * tBCV;
            let clpEstimado = bs / tBase; 
            tasaExcelUsada = clpEstimado < 60000 ? tBase : (clpEstimado < 250000 ? t60k : t250k);
            clp = bs / tasaExcelUsada;
            usd = montoOriginal;
        } else if (monedaOriginal === "BS") {
            bs = montoOriginal;
            let clpEstimado = bs / tBase;
            tasaExcelUsada = clpEstimado < 60000 ? tBase : (clpEstimado < 250000 ? t60k : t250k);
            clp = bs / tasaExcelUsada;
            usd = bs / tBCV;
        } else { // CLP
            clp = montoOriginal;
            tasaExcelUsada = clp < 60000 ? tBase : (clp < 250000 ? t60k : t250k);
            bs = clp * tasaExcelUsada;
            usd = bs / tBCV;
        }

        // 4. Formateo del Mensaje Final con Tasa BCV
        const finalMsg = `✅ *Cotización RyR*
💰 **Monto solicitado:** ${montoOriginal} ${monedaOriginal}
---
🇨🇱 **Envías:** ${Math.round(clp).toLocaleString('es-CL')} CLP
📈 **Tasa:** ${tasaExcelUsada}
💵 **Equivalente:** ${usd.toFixed(2)} USD
🏛️ **Tasa BCV:** ${tBCV}
🇻🇪 **Reciben:** ${bs.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2})} Bs.
---
¿Deseas los datos para transferir?`;

        return res.json({ replies: [{ message: finalMsg }] });

    } catch (e) {
        return res.json({ replies: [] });
    }
});

app.listen(process.env.PORT || 10000);