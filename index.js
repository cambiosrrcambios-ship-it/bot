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

        // Preparamos la chuleta para la IA
        const datosMercado = `
        - Tasa para menos de 60k CLP: ${col[1]}
        - Tasa para 60k CLP o más: ${col[2]}
        - Tasa para 250k CLP o más: ${col[3]}
        - Valor Dólar BCV: ${col[5]} Bs por USD
        `;

        // 2. INSTRUCCIONES ESTRICTAS PARA CHATGPT
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `Eres el Agente de Ventas de Remesas RyR. Tu misión es convertir montos entre CLP, USD y BS usando estos datos: ${datosMercado}.
                    
                    REGLAS CRÍTICAS:
                    1. TODO cálculo debe mostrar cuánto debe pagar el cliente en PESOS CHILENOS (CLP).
                    2. Si te piden Bolívares (BS), calcula cuántos Dólares son (BS / BCV) y luego cuántos Pesos (CLP) cuesta eso usando la tasa correspondiente.
                    3. FORMATO DE RESPUESTA (Obligatorio):
                       ✅ *Cotización RyR*
                       💰 **Monto solicitado:** [Cantidad original]
                       ---
                       🇨🇱 **Debes enviar:** [Monto] CLP
                       📈 **Tasa aplicada:** [Tasa]
                       💵 **Equivalente en USD:** [Monto] USD
                       🇻🇪 **Reciben en Venezuela:** [Monto] Bs.
                       ---
                       ¿Deseas los datos para transferir?`
                },
                { role: "user", content: userMsg }
            ],
            temperature: 0.1 // Esto hace que sea más preciso y menos "creativo"
        });

        res.json({ replies: [{ message: completion.choices[0].message.content }] });

    } catch (e) {
        res.json({ replies: [{ message: "⚠️ Hola! Indica el monto y la moneda para darte el valor exacto." }] });
    }
});

app.listen(process.env.PORT || 10000);