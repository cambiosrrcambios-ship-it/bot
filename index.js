const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

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

        // 1. CAPTURAR EL MENSAJE (DEBUG INCLUIDO)
        let raw = "";
        // Buscamos en todas las cajas posibles donde AutoResponder guarda el texto
        if (req.body.query && req.body.query.message) raw = req.body.query.message;
        else if (req.body.message) raw = req.body.message;
        else if (req.body.text) raw = req.body.text;
        
        raw = String(raw).toLowerCase().trim();

        // --- INICIO DE LÓGICA DE EXTRACCIÓN MEJORADA ---
        
        // Eliminamos los puntos de miles para que "10.000" sea "10000"
        let textoLimpio = raw.replace(/\./g, '');
        
        // Buscamos el primer número que aparezca
        let match = textoLimpio.match(/\d+/);
        let montoEncontrado = match ? parseFloat(match[0]) : 0;

        // Si dice "mil" y el número es bajo (como 10), lo multiplicamos
        if (raw.includes("mil") && montoEncontrado < 1000) {
            montoEncontrado = montoEncontrado * 1000;
        }

        // --- FIN DE LÓGICA ---

        if (montoEncontrado === 0) {
            return res.json({ 
                replies: [{ message: `DEBUG: Recibí "${raw}", pero no detecté números. Intenta poner: 10000 pesos.` }] 
            });
        }

        let moneda = "";
        if (raw.includes("pesos") || raw.includes("clp")) moneda = "CLP";
        else if (raw.includes("bs") || raw.includes("bolivares") || raw.includes("bolívares")) moneda = "BS";
        else if (raw.includes("usd") || raw.includes("dolar") || raw.includes("$")) moneda = "USD";

        if (!moneda) {
            return res.json({ 
                replies: [{ message: `Detecté el monto ${montoEncontrado}, pero no sé si son Pesos o Dólares. ¿Podrías aclararlo?` }] 
            });
        }

        // Cálculos
        let dlar, clp, bs, resp;
        const bcv_f = BCV.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (moneda === "CLP") {
            clp = montoEncontrado;
            let t = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            dlar = (clp * t) / BCV;
            bs = dlar * BCV;
            resp = `✅ *Cálculo RyR*\n\n🇨🇱 Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP\n📊 Tasa: ${t}\n📈 Dólar BCV: ${bcv_f} Bs.\n💵 USD: ${dlar.toFixed(2)}\n\n🇻🇪 *Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs.*`;
        } 
        else if (moneda === "BS") {
            bs = montoEncontrado;
            dlar = bs / BCV;
            let t = (dlar * BCV / T_BASE) >= 250000 ? T_250K : ((dlar * BCV / T_BASE) >= 60000 ? T_60K : T_BASE);
            clp = (dlar * BCV) / t;
            resp = `✅ *Cálculo RyR*\n\n🇻🇪 Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs\n📈 Dólar BCV: ${bcv_f} Bs.\n💵 USD: ${dlar.toFixed(2)}\n\n🇨🇱 *Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP*`;
        } 
        else {
            dlar = montoEncontrado;
            bs = dlar * BCV;
            let t = (bs / T_BASE) >= 250000 ? T_250K : ((bs / T_BASE) >= 60000 ? T_60K : T_BASE);
            clp = bs / t;
            resp = `✅ *Cálculo RyR*\n\n💵 Monto: ${dlar.toLocaleString('en-US')} USD\n📈 Dólar BCV: ${bcv_f} Bs.\n\n🇨🇱 Chile: ${Math.round(clp).toLocaleString('es-CL')} CLP\n🇻🇪 Venezuela: ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (e) {
        return res.json({ replies: [{ message: "⚠️ Error en el servidor o Excel. Revisa los datos." }] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log("Servidor RyR Activo"));