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
    // --- 1. FILTRO DE SEGURIDAD ULTRA-ESTRICTO ---
    const query = req.body.query || {};
    const sender = String(query.sender || "").replace(/\D/g, ''); // Solo números
    const jid = String(query.remoteJid || "").replace(/\D/g, ''); // Solo números

    // Verificamos si alguno de los dos campos empieza por 56
    const esChile = sender.startsWith('56') || jid.startsWith('56');

    // SI NO ES DE CHILE, NO RESPONDEMOS NADA
    if (!esChile) {
        console.log(`Bloqueado: Intento desde número no chileno.`);
        return res.json({ replies: [] });
    }

    try {
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const columnas = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const T_BASE = limpiarExcel(columnas[1]);
        const T_60K  = limpiarExcel(columnas[2]);
        const T_250K = limpiarExcel(columnas[3]);
        const BCV    = limpiarExcel(columnas[5]);

        // --- 2. CAPTURAR EL MENSAJE COMPLETO ---
        let raw = query.message || req.body.message || "";
        let texto = String(raw).toLowerCase().trim();

        // --- 3. EXTRAER EL MONTO ---
        // Quitamos puntos para que "10.000" sea "10000"
        let soloDigitos = texto.replace(/\./g, '').match(/\d+/);
        
        if (!soloDigitos) {
            return res.json({ replies: [{ message: "⚠️ Por favor, indica si el monto es en *Pesos, Dólares o Bolívares* para poder realizar el cálculo correctamente." }] });
        }

        let monto = parseFloat(soloDigitos[0]);
        if (texto.includes("mil") && monto < 1000) monto *= 1000;

        // --- 4. DETECTAR MONEDA (Búsqueda en toda la frase) ---
        let moneda = "";
        if (/peso|clp|chile/i.test(texto)) moneda = "CLP";
        else if (/bs|bolivar|bolívar/i.test(texto)) moneda = "BS";
        else if (/usd|dolar|dólar|\$/i.test(texto)) moneda = "USD";

        if (!moneda) {
            return res.json({ replies: [{ message: "⚠️ Por favor, indica si el monto es en *Pesos, Dólares o Bolívares* para poder realizar el cálculo correctamente." }] });
        }

        // --- 5. CÁLCULOS ---
        let dlar, clp, bs, resp, t;
        const bcv_f = BCV.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (moneda === "CLP") {
            clp = monto;
            t = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            dlar = (clp * t) / BCV;
            bs = dlar * BCV;
            resp = `✅ *Cálculo RyR (Desde Pesos)*\n\n🇨🇱 Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP\n📊 Tasa: ${t}\n📈 Dólar BCV: ${bcv_f} Bs.\n💵 USD: ${dlar.toFixed(2)}\n\n🇻🇪 *Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs.*`;
        } 
        else if (moneda === "BS") {
            bs = monto;
            dlar = bs / BCV;
            let clpRef = (dlar * BCV) / T_BASE;
            t = clpRef >= 250000 ? T_250K : (clpRef >= 60000 ? T_60K : T_BASE);
            clp = (dlar * BCV) / t;
            resp = `✅ *Cálculo RyR (Desde Bolívares)*\n\n🇻🇪 Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs\n📈 Dólar BCV: ${bcv_f} Bs.\n💵 USD: ${dlar.toFixed(2)}\n\n🇨🇱 *Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP*`;
        } 
        else {
            dlar = monto;
            bs = dlar * BCV;
            let clpRef = bs / T_BASE;
            t = clpRef >= 250000 ? T_250K : (clpRef >= 60000 ? T_60K : T_BASE);
            clp = bs / t;
            resp = `✅ *Cálculo RyR (Desde Dólares)*\n\n💵 Monto: ${dlar.toLocaleString('en-US')} USD\n📈 Dólar BCV: ${bcv_f} Bs.\n\n🇨🇱 Chile: ${Math.round(clp).toLocaleString('es-CL')} CLP\n🇻🇪 Venezuela: ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (e) {
        return res.json({ replies: [{ message: "⚠️ Por favor, indica si el monto es en *Pesos, Dólares o Bolívares* para poder realizar el cálculo correctamente." }] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log("Servidor RyR Protegido"));