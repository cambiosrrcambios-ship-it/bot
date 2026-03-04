const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SHEET_URL = "https://docs.google.com"; 

app.post('/', async (req, res) => {
    try {
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/);
        const columnas = filas[1].split(','); 

        const limpiarNum = (val) => {
            if (!val) return 0;
            return parseFloat(val.replace(/[^0-9.]/g, ''));
        };

        const T_BASE = limpiarNum(columnas[1]); 
        const T_60K  = limpiarNum(columnas[2]); 
        const T_250K = limpiarNum(columnas[3]); 
        const BCV    = limpiarNum(columnas[5]); 

        let rawMessage = req.body.query || req.body.message || "";
        let match = rawMessage.match(/\d+([\d.]*)/);
        if (!match) return res.json({ replies: [{ message: "Indica un monto numérico." }] });

        let monto = parseFloat(match[0].replace(/\./g, ''));
        let esBs = /bs|bolivares|bolívares/i.test(rawMessage);
        let esPesos = /pesos|clp|chilenos/i.test(rawMessage);
        let dlar, clp, bs, resp;

        if (esPesos) {
            clp = monto;
            let t = clp > 249999 ? T_250K : (clp > 59999 ? T_60K : T_BASE);
            dlar = clp / t;
            bs = dlar * BCV;
            resp = "Si envias " + clp.toLocaleString('es-CL') + " pesos, son " + dlar.toFixed(2) + " USD y llegan " + bs.toLocaleString('es-VE', {minimumFractionDigits:2}) + " Bs.";
        } else if (esBs) {
            bs = monto;
            dlar = bs / BCV;
            let t = (dlar * T_BASE > 249999) ? T_250K : (dlar * T_BASE > 59999 ? T_60K : T_BASE);
            clp = dlar * t;
            resp = "Para que lleguen " + bs.toLocaleString('es-VE') + " Bs, a BCV (" + BCV + ") serian " + Math.round(clp).toLocaleString('es-CL') + " pesos (" + dlar.toFixed(2) + " USD).";
        } else {
            dlar = monto;
            let t = (dlar * T_BASE > 249999) ? T_250K : (dlar * T_BASE > 59999 ? T_60K : T_BASE);
            clp = dlar * t;
            bs = dlar * BCV;
            resp = "Si necesitas " + dlar + " dolares, a BCV (" + BCV + ") serian " + Math.round(clp).toLocaleString('es-CL') + " pesos y llegan " + bs.toLocaleString('es-VE', {minimumFractionDigits:2}) + " Bs.";
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (error) {
        return res.json({ replies: [{ message: "Error: No se pudieron leer las tasas del Excel. Revisa B2, C2, D2 y F2." }] });
    }
});

app.get('/', (req, res) => res.send("Servidor Activo ✅"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log("Servidor OK"));