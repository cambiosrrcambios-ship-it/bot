[4:00 p. m., 4/3/2026] Kevin Rodriguez: const express = require('express');
const axios = require('axios');
const app = express();

// Soporte para leer JSON y datos de formularios
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// REEMPLAZA CON TU ENLACE DE GOOGLE SHEETS (PUBLICADO COMO CSV)
const SHEET_URL = "TU_ENLACE_AQUI"; 

app.post('/', async (req, res) => {
    console.log("Mensaje recibido:", req.body); // Esto imprimirá en los Logs de Render
    
    try {
        // 1. Obtener datos del Excel Online
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split('\n');
        const columnas = filas[1].split(','); // Fila 2

        const T_BASE = parseFloat(columnas[1]); // B2
        const T_60K  = parseFloat(columnas[2]); // C…
[4:12 p. m., 4/3/2026] Kevin Rodriguez: const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// REEMPLAZA CON TU ENLACE DE GOOGLE SHEETS (PUBLICADO COMO CSV)
const SHEET_URL = "TU_ENLACE_AQUI"; 

app.post('/', async (req, res) => {
    try {
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split('\n');
        const columnas = filas[1].split(','); 

        const T_BASE = parseFloat(columnas[1]); 
        const T_60K  = parseFloat(columnas[2]); 
        const T_250K = parseFloat(columnas[3]); 
        const BCV    = parseFloat(columnas[5]); 

        let rawMessage = req.body.query || req.body.message || "";
        let match = rawMessage.match(/\d+([\d.]*)/);
        
        if (!match) {
            return res.json({ replies: [{ message: "Por favor, indica un monto numérico." }] });
        }

        let monto = parseFloat(match[0].replace(/\./g, ''));
        let esBs = /bs|bolivares|bolívares/i.test(rawMessage);
        let esPesos = /pesos|clp|chilenos/i.test(rawMessage);
        let dlar, clp, bs, resp;

        if (esPesos) {
            clp = monto;
            let t = clp > 249999 ? T_250K : (clp > 59999 ? T_60K : T_BASE);
            dlar = clp / t;
            bs = dlar * BCV;
            resp = "Si envías " + clp.toLocaleString('es-CL') + " pesos, son " + dlar.toFixed(2) + " USD y llegan " + bs.toLocaleString('es-VE', {minimumFractionDigits:2}) + " Bs.";
        } else if (esBs) {
            bs = monto;
            dlar = bs / BCV;
            let t = (dlar * T_BASE > 249999) ? T_250K : (dlar * T_BASE > 59999 ? T_60K : T_BASE);
            clp = dlar * t;
            resp = "Para que lleguen " + bs.toLocaleString('es-VE') + " Bs, a BCV (" + BCV + ") serían " + Math.round(clp).toLocaleString('es-CL') + " pesos (" + dlar.toFixed(2) + " USD).";
        } else {
            dlar = monto;
            let t = (dlar * T_BASE > 249999) ? T_250K : (dlar * T_BASE > 59999 ? T_60K : T_BASE);
            clp = dlar * t;
            bs = dlar * BCV;
            resp = "Si necesitas " + dlar + " dólares, a BCV (" + BCV + ") serían " + Math.round(clp).toLocaleString('es-CL') + " pesos y llegan " + bs.toLocaleString('es-VE', {minimumFractionDigits:2}) + " Bs.";
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (error) {
        return res.json({ replies: [{ message: "Error al procesar la tasa. Intenta de nuevo." }] });
    }
});

app.get('/', (req, res) => res.send("Servidor de Remesas Activo ✅"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log("Servidor corriendo"));