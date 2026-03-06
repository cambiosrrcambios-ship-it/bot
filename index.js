const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

const limpiar = (v) => {
    if (!v) return 0;
    let n = v.toString().replace(/[^0-9.,]/g, '');
    if (n.includes(',') && n.includes('.')) n = n.replace(/\./g, '').replace(',', '.');
    else if (n.includes(',')) n = n.replace(',', '.');
    return parseFloat(n) || 0;
};

app.post('/', async (req, res) => {
    try {
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const columnas = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const T_BASE = limpiar(columnas[1]);
        const BCV = limpiar(columnas[5]);

        // --- ESTO ES LO IMPORTANTE ---
        // Vamos a enviarte de vuelta TODO lo que el bot recibe para ver dónde está el error
        const cuerpoRecibido = JSON.stringify(req.body);
        
        let raw = "";
        // Intentamos extraer el texto de los lugares más comunes
        if (req.body.message) raw = req.body.message;
        else if (req.body.text) raw = req.body.text;
        else if (req.body.query) raw = req.body.query;
        else if (req.body.content) raw = req.body.content;

        let numMatch = String(raw).match(/\d+([\d.,]*)/);

        if (!numMatch) {
            // Si falla, el bot te dirá qué recibió exactamente en el JSON
            return res.json({ 
                replies: [{ 
                    message: `DEBUG: El bot recibió esto: ${cuerpoRecibido}. No encontré un número ahí.` 
                }] 
            });
        }

        // Si encuentra el número, hace el cálculo normal (usando T_BASE por defecto para el ejemplo)
        let monto = limpiar(numMatch[0]);
        let dlar = /bs/i.test(raw) ? monto / BCV : monto;
        let bs = dlar * BCV;
        let clp = dlar * T_BASE;

        let resp = `✅ Detectado: ${monto}\nChile: ${Math.round(clp)} CLP\nVen: ${Math.round(bs)} Bs.`;
        return res.json({ replies: [{ message: resp }] });

    } catch (error) {
        return res.json({ replies: [{ message: "Error: " + error.message }] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log("Servidor RyR Listo"));