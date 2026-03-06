const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

// Limpia los datos que vienen del Excel (comas por puntos, etc)
const limpiarExcel = (v) => {
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

        const T_BASE = limpiarExcel(columnas[1]);
        const T_60K  = limpiarExcel(columnas[2]);
        const T_250K = limpiarExcel(columnas[3]);
        const BCV    = limpiarExcel(columnas[5]);

        // 1. OBTENER EL MENSAJE
        let raw = "";
        if (req.body.query && req.body.query.message) raw = String(req.body.query.message).toLowerCase();
        else raw = String(req.body.message || req.body.text || "").toLowerCase();

        // 2. EXTRAER EL NÚMERO (Lógica Ultra-Simple)
        // Quitamos puntos de miles y palabras, solo dejamos dígitos
        let soloNumeros = raw.replace(/\./g, '').match(/\d+/);
        
        if (!soloNumeros) {
            return res.json({ replies: [{ message: "¡Hola! 👋 No detecté un monto. Ejemplo: 10 mil pesos o 20 usd." }] });
        }

        let monto = parseFloat(soloNumeros[0]);

        // Si el cliente escribió "mil" y el número es pequeño (ej: 10 mil), lo multiplicamos
        if (raw.includes("mil") && monto < 1000) {
            monto = monto * 1000;
        }

        // 3. DETECTAR MONEDA
        let moneda = "";
        if (raw.includes("pesos") || raw.includes("clp") || raw.includes("chilenos")) moneda = "CLP";
        else if (raw.includes("bs") || raw.includes("bolivares") || raw.includes("bolívares")) moneda = "BS";
        else if (raw.includes("usd") || raw.includes("dolar") || raw.includes("dólar") || raw.includes("$")) moneda = "USD";

        if (!moneda) {
            return res.json({ replies: [{ message: "⚠️ ¿El monto de " + monto.toLocaleString() + " es en Pesos, Dólares o Bolívares?" }] });
        }

        // 4. CÁLCULOS (Tu fórmula: USD * BCV / Tasa)
        let dlar, clp, bs, resp;
        const bcv_f = BCV.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (moneda === "CLP") {
            clp = monto;
            let t = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            dlar = (clp * t) / BCV;
            bs = dlar * BCV;
            resp = `✅ *Cálculo RyR (Desde Pesos)*\n\n🇨🇱 Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP\n📊 Tasa: ${t}\n📈 Dólar BCV: ${bcv_f} Bs.\n💵 USD: ${dlar.toFixed(2)}\n\n🇻🇪 *Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs.*`;
        } 
        else if (moneda === "BS") {
            bs = monto;
            dlar = bs / BCV;
            let t = (dlar * BCV / T_BASE) >= 250000 ? T_250K : ((dlar * BCV / T_BASE) >= 60000 ? T_60K : T_BASE);
            clp = (dlar * BCV) / t;
            resp = `✅ *Cálculo RyR (Desde Bolívares)*\n\n🇻🇪 Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs\n📈 Dólar BCV: ${bcv_f} Bs.\n💵 USD: ${dlar.toFixed(2)}\n\n🇨🇱 *Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP*`;
        } 
        else {
            dlar = monto;
            bs = dlar * BCV;
            let t = (bs / T_BASE) >= 250000 ? T_250K : ((bs / T_BASE) >= 60000 ? T_60K : T_BASE);
            clp = bs / t;
            resp = `✅ *Cálculo RyR (Desde Dólares)*\n\n💵 Monto: ${dlar.toLocaleString('en-US')} USD\n📈 Dólar BCV: ${bcv_f} Bs.\n\n🇨🇱 Chile: ${Math.round(clp).toLocaleString('es-CL')} CLP\n🇻🇪 Venezuela: ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (e) {
        return res.json({ replies: [{ message: "❌ Hubo un error. Intenta escribir el monto de nuevo." }] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log("Servidor RyR Listo"));