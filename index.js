const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

app.post('/', async (req, res) => {
    try {
        // 1. CAPTURAR MENSAJE
        const userMsg = req.body.query?.message || req.body.message || req.body.text || "";
        if (!userMsg) return res.json({ replies: [] });

        // --- FILTRO DE AHORRO (Solo procesa si hay números) ---
        if (!/\d/.test(userMsg)) {
            console.log("Mensaje sin números ignorado (Ahorro de saldo)");
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

        // 3. LLAMADA A OPENAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `Eres el cotizador experto de Remesas RyR. 
                    TASAS: Base:${tBase}, >60k:${t60k}, >250k:${t250k}, BCV:${tBCV}.

                    REGLA DE SILENCIO: 
                    - Si el mensaje no es sobre dinero o tasas, responde: IGNORE.

                    REGLAS MATEMÁTICAS (ESTRICTAS):
                    1. SI PIDEN BS: 
                       - Envías (CLP) = Monto_BS / Tasa_Excel.
                       - Equivalente (USD) = Monto_BS / ${tBCV}.
                    2. SI PIDEN CLP: 
                       - Reciben (BS) = Monto_CLP * Tasa_Excel.
                       - Equivalente (USD) = (Monto_CLP * Tasa_Excel) / ${tBCV}.
                    3. SI PIDEN USD: 
                       - Reciben (BS) = Monto_USD * ${tBCV}.
                       - Envías (CLP) = (Monto_USD * ${tBCV}) / Tasa_Excel.

                    *Nota: Usa la tasa de Excel que corresponda según el monto en CLP resultante.*

                    FORMATO DE RESPUESTA:
                    ✅ *Cotización RyR*
                    💰 **