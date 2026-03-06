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

        const T_BASE  = limpiar(columnas[1]); // Ejemplo: 0.6
        const T_60K   = limpiar(columnas[2]);
        const T_250K  = limpiar(columnas[3]);
        const BCV     = limpiar(columnas[5]); // Ejemplo: 450

        let raw = "";
        if (req.body.query && req.body.query.message) raw = String(req.body.query.message);
        else raw = String(req.body.message || req.body.text || "");

        let numMatch = raw.match(/\d+([\d.,]*)/);
        if (!numMatch) return res.json({ replies: [{ message: "Indica un monto. Ej: 10 usd" }] });

        let monto = limpiar(numMatch[0]);
        let esBs = /bs|bolivares/i.test(raw);
        let esPesos = /pesos|clp/i.test(raw);
        let dlar, clp, bs, resp;

        // --- NUEVA LÓGICA DE CÁLCULO ---
        
        if (esPesos) {
            clp = monto;
            // Determinamos qué tasa base usar según el monto en pesos
            let t_base_actual = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            
            // Si CLP = (USD * BCV) / TasaBase -> Entonces USD = (CLP * TasaBase) / BCV
            dlar = (clp * t_base_actual) / BCV;
            bs = dlar * BCV;
            
            resp = `✅ *Cálculo RyR*\n\n🇨🇱 Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP\n📊 Tasa: ${t_base_actual}\n💵 Equivale a: ${dlar.toFixed(2)} USD\n\n🇻🇪 *Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs.*`;

        } else if (esBs) {
            bs = monto;
            dlar = bs / BCV;
            // Para Bs, usamos T_BASE para calcular el tramo
            let t_base_actual = (dlar * BCV / T_BASE) >= 250000 ? T_250K : ((dlar * BCV / T_BASE) >= 60000 ? T_60K : T_BASE);
            
            clp = (dlar * BCV) / t_base_actual;
            
            resp = `✅ *Cálculo RyR*\n\n🇻🇪 Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs\n📊 BCV: ${BCV}\n💵 USD: ${dlar.toFixed(2)}\n\n🇨🇱 *Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP*`;

        } else {
            // CASO USD (Tu ejemplo: 10 USD)
            dlar = monto;
            bs = dlar * BCV;
            // Calculamos CLP usando tu fórmula: (USD * BCV) / TasaBase
            let t_base_actual = (bs / T_BASE) >= 250000 ? T_250K : ((bs / T_BASE) >= 60000 ? T_60K : T_BASE);
            clp = bs / t_base_actual;

            resp = `✅ *Cálculo RyR*\n\n💵 Monto: ${dlar} USD\n📊 Tasa BCV: ${BCV}\n\n🇨🇱 Chile: ${Math.round(clp).toLocaleString('es-CL')} CLP\n🇻🇪 Venezuela: ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (error) {
        return res.json({ replies: [{ message: "⚠️ Error: " + error.message }] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log("Servidor RyR con lógica corregida"));