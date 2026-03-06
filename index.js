const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

// Limpia los datos del Excel
const limpiarExcel = (v) => {
    if (!v) return 0;
    let n = v.toString().replace(/[^0-9.,]/g, '');
    if (n.includes(',') && n.includes('.')) n = n.replace(/\./g, '').replace(',', '.');
    else if (n.includes(',')) n = n.replace(',', '.');
    return parseFloat(n) || 0;
};

// Limpia lo que escribe el usuario (Maneja 10.000 y 10mil)
const limpiarUsuario = (texto) => {
    let t = texto.toLowerCase();
    let n = t.replace(/[^0-9]/g, ''); 
    let monto = parseFloat(n) || 0;
    // Si el usuario escribió "mil" (ej: 10mil), multiplicamos por 1000
    if (t.includes('mil') && monto < 1000) monto = monto * 1000;
    return monto;
};

app.post('/', async (req, res) => {
    try {
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const columnas = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const T_BASE  = limpiarExcel(columnas[1]);
        const T_60K   = limpiarExcel(columnas[2]);
        const T_250K  = limpiarExcel(columnas[3]);
        const BCV     = limpiarExcel(columnas[5]);

        let raw = "";
        if (req.body.query && req.body.query.message) raw = String(req.body.query.message).toLowerCase();
        else raw = String(req.body.message || req.body.text || "").toLowerCase();

        // Buscamos el número
        let numMatch = raw.match(/\d+([\d.]*)/);
        
        if (!numMatch || raw.trim() === "") {
            return res.json({ replies: [{ message: "¡Hola! 👋 Para ayudarte, indica un monto y la moneda.\n\nEjemplo: 20 usd, 50mil pesos o 10.000 bs." }] });
        }

        let monto = limpiarUsuario(raw);
        
        // --- VALIDACIÓN DE MONEDA ---
        let esBs = /bs|bolivares|bolívares/i.test(raw);
        let esPesos = /pesos|clp|chilenos|cl/i.test(raw);
        let esUsd = /usd|dolar|dólar|dolares|dólares|\$/i.test(raw);

        // Si el usuario NO puso ninguna moneda, le pedimos que aclare
        if (!esBs && !esPesos && !esUsd) {
            return res.json({ 
                replies: [{ message: "⚠️ Por favor, indica si el monto es en *Pesos, Dólares o Bolívares* para poder realizar el cálculo correctamente." }] 
            });
        }

        let dlar, clp, bs, resp;

        if (esPesos) {
            clp = monto;
            let t = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            dlar = (clp * t) / BCV;
            bs = dlar * BCV;
            resp = `✅ *Cálculo RyR (Desde Pesos)*\n\n🇨🇱 Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP\n📊 Tasa: ${t}\n💵 USD: ${dlar.toFixed(2)}\n\n🇻🇪 *Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs.*`;
        } 
        else if (esBs) {
            bs = monto;
            dlar = bs / BCV;
            let t = (dlar * BCV / T_BASE) >= 250000 ? T_250K : ((dlar * BCV / T_BASE) >= 60000 ? T_60K : T_BASE);
            clp = (dlar * BCV) / t;
            resp = `✅ *Cálculo RyR (Desde Bolívares)*\n\n🇻🇪 Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs\n📊 Tasa BCV: ${BCV}\n💵 USD: ${dlar.toFixed(2)}\n\n🇨🇱 *Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP*`;
        } 
        else {
            // CASO USD
            dlar = monto;
            bs = dlar * BCV;
            let t = (bs / T_BASE) >= 250000 ? T_250K : ((bs / T_BASE) >= 60000 ? T_60K : T_BASE);
            clp = bs / t;
            resp = `✅ *Cálculo RyR (Desde Dólares)*\n\n💵 Monto: ${dlar.toLocaleString('en-US')} USD\n📊 Tasa BCV: ${BCV}\n\n🇨🇱 Chile: ${Math.round(clp).toLocaleString('es-CL')} CLP\n🇻🇪 Venezuela: ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (error) {
        return res.json({ replies: [{ message: "❌ Error: Por favor escribe el monto de nuevo." }] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log("Servidor RyR Listo"));