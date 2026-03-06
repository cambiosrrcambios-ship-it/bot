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

// --- NUEVA FUNCIÓN DE EXTRACCIÓN ROBUSTA ---
const extraerDatosUsuario = (texto) => {
    let t = texto.toLowerCase().replace(/\s+/g, ''); // Quitamos TODOS los espacios
    
    // 1. Detectamos el número (incluso si tiene puntos de miles como 10.000)
    // Buscamos la primera secuencia de números y puntos
    let match = t.match(/\d+([\d.]*)/);
    if (!match) return { monto: 0, moneda: null };

    let numeroLimpio = match[0].replace(/\./g, ''); // Quitamos puntos de miles
    let monto = parseFloat(numeroLimpio) || 0;

    // 2. Si el texto tiene "mil", multiplicamos (ej: 10mil -> 10000)
    if (t.includes('mil') && monto < 1000) {
        monto = monto * 1000;
    }

    // 3. Identificamos moneda
    let moneda = null;
    if (/bs|bolivares|bolívares/.test(t)) moneda = 'BS';
    else if (/pesos|clp|chilenos|cl/.test(t)) moneda = 'CLP';
    else if (/usd|dolar|dólar|dolares|dólares|\$/.test(t)) moneda = 'USD';

    return { monto, moneda };
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

        let raw = "";
        if (req.body.query && req.body.query.message) raw = String(req.body.query.message);
        else raw = String(req.body.message || req.body.text || "");

        // Procesamos el mensaje
        const { monto, moneda } = extraerDatosUsuario(raw);

        // Si no hay monto o no hay moneda, pedimos aclarar
        if (monto === 0) {
            return res.json({ replies: [{ message: "¡Hola! 👋 Indica un monto. Ejemplo: 10 mil pesos." }] });
        }
        if (!moneda) {
            return res.json({ replies: [{ message: "⚠️ Indica si el monto es en *Pesos, Bolívares o Dólares*." }] });
        }

        let dlar, clp, bs, resp;
        const bcv_f = BCV.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (moneda === 'CLP') {
            clp = monto;
            let t = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            dlar = (clp * t) / BCV;
            bs = dlar * BCV;
            resp = `✅ *Cálculo RyR (Desde Pesos)*\n\n🇨🇱 Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP\n📊 Tasa RyR: ${t}\n📈 Dólar BCV: ${bcv_f} Bs.\n💵 USD: ${dlar.toFixed(2)}\n\n🇻🇪 *Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs.*`;
        } 
        else if (moneda === 'BS') {
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
        return res.json({ replies: [{ message: "❌ Error: Escribe el monto de nuevo." }] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log("Servidor RyR Activo"));