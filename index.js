const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

// Limpiador de números (Ya funciona con tus puntos decimales)
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
        
        if (filas.length < 2) throw new Error("Excel vacío o mal publicado.");

        const fila2 = filas[1];
        const separador = fila2.includes(';') ? ';' : ',';
        const columnas = fila2.split(separador);

        const T_BASE  = limpiar(columnas[1]);
        const T_60K   = limpiar(columnas[2]);
        const T_250K  = limpiarNum = limpiar(columnas[3]);
        const BCV     = limpiar(columnas[5]);

        if (T_BASE <= 0 || BCV <= 0) {
            throw new Error(`Datos en 0 (B2:${columnas[1]} F2:${columnas[5]})`);
        }

        // --- CORRECCIÓN DEL ERROR "raw.match" ---
        // Aseguramos que el mensaje sea un String, si no viene nada ponemos "vacio"
        let raw = "";
        if (req.body.query) raw = String(req.body.query);
        else if (req.body.message) raw = String(req.body.message);
        else if (req.body.content) raw = String(req.body.content); // Por si viene de ManyChat
        
        let numMatch = raw.match(/\d+([\d.,]*)/);
        
        if (!numMatch) {
            return res.json({ replies: [{ message: "Hola! Por favor indica un monto. Ejemplo: 50000" }] });
        }

        let monto = limpiar(numMatch[0]);
        let esBs = /bs|bolivares/i.test(raw);
        let esPesos = /pesos|clp/i.test(raw);
        let dlar, clp, bs, resp;

        if (esPesos) {
            clp = monto;
            let t = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            dlar = clp / t;
            bs = dlar * BCV;
            resp = `✅ *Cálculo RyR*\n\nEnvías: ${Math.round(clp).toLocaleString('es-CL')} CLP\nTasa: ${t}\nUSD: ${dlar.toFixed(2)}\n*Llegan: ${Math.round(bs).toLocaleString('es-VE')} Bs.*`;
        } else if (esBs) {
            bs = monto;
            dlar = bs / BCV;
            let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            resp = `✅ *Cálculo RyR*\n\nPara recibir: ${Math.round(bs).toLocaleString('es-VE')} Bs\nTasa BCV: ${BCV}\n*Debes enviar: ${Math.round(clp).toLocaleString('es-CL')} CLP* (${dlar.toFixed(2)} USD)`;
        } else {
            dlar = monto;
            let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            bs = dlar * BCV;
            resp = `✅ *Cálculo RyR*\n\nPara ${dlar} USD:\nChile: ${Math.round(clp).toLocaleString('es-CL')} CLP\nVenezuela: ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (e) {
        console.error("Error:", e.message);
        return res.json({ replies: [{ message: "Hubo un problema: " + e.message }] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor activo` || 10000));