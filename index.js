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

        // 2. Le pedimos a la IA que solo extraiga el NÚMERO y la MONEDA que pide el cliente
        const extraction = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Extrae el monto y la moneda del mensaje del usuario. Responde solo en JSON: {\"monto\": 10, \"moneda\": \"USD\"}. Monedas posibles: CLP, BS, USD." },
                { role: "user", content: userMsg }
            ],
            temperature: 0
        });

        const data = JSON.parse(extraction.choices[0].message.content);
        let monto = data.monto;
        let moneda = data.moneda;
        
        let clp, bs, usd, tasaUsada;

        // 3. HACEMOS NOSOTROS LA MATEMÁTICA (No la IA)
        if (moneda === "USD") {
            bs = monto * tBCV;
            tasaUsada = bs / tBase < 60000 ? tBase : (bs / t60k < 250000 ? t60k : t250k);
            clp = bs / tasaUsada;
            usd = monto;
        } else if (moneda === "BS") {
            bs = monto;
            tasaUsada = bs / tBase < 60000 ? tBase : (bs / t60k < 250000 ? t60k : t250k);
            clp = bs / tasaUsada;
            usd = bs / tBCV;
        } else { // CLP
            clp = monto;
            tasaUsada = clp < 60000 ? tBase : (clp < 250000 ? t60k : t250k);
            bs = clp * tasaUsada;
            usd = bs / tBCV;
        }

        // 4. La IA ahora SOLO redacta el mensaje final con los números ya calculados
        const finalMsg = `✅ *Cotización RyR*
💰 **Monto solicitado:** ${monto} ${moneda}
---
🇨🇱 **Envías:** ${clp.toLocaleString('es-CL', {maximumFractionDigits: 0})} CLP
📈 **Tasa aplicada:** ${tasaUsada}
💵 **Equivalente:** ${usd.toFixed(2)} USD
🇻🇪 **Reciben:** ${bs.toLocaleString('es-VE', {maximumFractionDigits: 2})} Bs.
---
¿Deseas los datos para transferir?`;

        return res.json({ replies: [{ message: finalMsg }] });

    } catch (e) {
        return res.json({ replies: [] });
    }
});

app.listen(process.env.PORT || 10000);