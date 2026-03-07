const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

app.post('/', async (req, res) => {
    try {
        // 1. CAPTURAR DATOS (Mensaje y Remitente)
        const userMsg = req.body.query?.message || req.body.message || req.body.text || "";
        // AutoResponder suele enviar el número en 'sender' o 'contact_id'
        const sender = req.body.query?.sender || req.body.sender || ""; 

        if (!userMsg) return res.json({ replies: [] });

        // --- FILTRO DE PAÍS: SOLO CHILE (Código 56) ---
        // Limpiamos el número de símbolos como + por si acaso
        const cleanSender = sender.replace(/\D/g, ''); 
        
        // Si el número NO empieza con 56, ignoramos.
        // (Nota: Si el número es corto o no tiene código, también lo ignora)
        if (cleanSender && !cleanSender.startsWith('56')) {
            console.log(`Mensaje de ${sender} ignorado por no ser de Chile.`);
            return res.json({ replies: [] });
        }

        // 2. OBTENER TASAS DEL EXCEL
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const col = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const tBase = parseFloat(col[1].replace(',', '.'));
        const t60k = parseFloat(col[2].replace(',', '.'));
        const t250k = parseFloat(col[3].replace(',', '.'));
        const tBCV = parseFloat(col[5].replace(',', '.'));

        // 3. IA: EXTRAER MONTO Y MONEDA
        const extraction = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Extrae monto y moneda. Responde solo JSON: {\"monto\": 10, \"moneda\": \"USD\"}. Monedas: CLP, BS, USD." },
                { role: "user", content: userMsg }
            ],
            temperature: 0
        });

        const data = JSON.parse(extraction.choices[0].message.content);
        let monto = data.monto;
        let moneda = data.moneda;
        
        let clp, bs, usd, tasaUsada;

        // 4. CÁLCULOS MATEMÁTICOS (Lógica RyR)
        if (moneda === "USD") {
            bs = monto * tBCV;
            // Cálculo de tasa según el equivalente en BS / tBase para estimar CLP
            let estimadoCLP = bs / tBase;
            tasaUsada = estimadoCLP < 60000 ? tBase : (estimadoCLP < 250000 ? t60k : t250k);
            clp = bs / tasaUsada;
            usd = monto;
        } else if (moneda === "BS") {
            bs = monto;
            let estimadoCLP = bs / tBase;
            tasaUsada = estimadoCLP < 60000 ? tBase : (estimadoCLP < 250000 ? t60k : t250k);
            clp = bs / tasaUsada;
            usd = bs / tBCV;
        } else { // CLP
            clp = monto;
            tasaUsada = clp < 60000 ? tBase : (clp < 250000 ? t60k : t250k);
            bs = clp * tasaUsada;
            usd = bs / tBCV;
        }

        // 5. FORMATO FINAL
        const finalMsg = `✅ *Cotización RyR*
💰 **Monto solicitado:** ${monto} ${moneda}
---
🇨🇱 **Envías:** ${Math.round(clp).toLocaleString('es-CL')} CLP
📈 **Tasa aplicada:** ${tasaUsada}
💵 **Equivalente:** ${usd.toFixed(2)} USD
🇻🇪 **Reciben:** ${bs.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 2})} Bs.
---
¿Deseas los datos para transferir?`;

        return res.json({ replies: [{ message: finalMsg }] });

    } catch (e) {
        console.error("Error en el servidor:", e);
        return res.json({ replies: [] });
    }
});

app.listen(process.env.PORT || 10000);