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
        // --- FILTRO DE CHILE ---
        // Extraemos el número del remitente
        let sender = req.body.query?.sender || req.body.sender || "";
        
        // Si no empieza por 56, ignoramos el mensaje por completo
        if (sender !== "" && !sender.startsWith("56") && !sender.startsWith("+56")) {
            return res.json({ replies: [] }); 
        }

        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const columnas = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const T_BASE = limpiarExcel(columnas[1]);
        const T_60K  = limpiarExcel(columnas[2]);
        const T_250K = limpiarExcel(columnas[3]);
        const BCV    = limpiarExcel(columnas[5]);

        // 1. OBTENER EL TEXTO
        let raw = req.body.query?.message || req.body.message || req.body.text || "";
        let texto = String(raw).toLowerCase().trim();

        // 2. EXTRAER EL NÚMERO (Mejorado para detectar 10000 o 10.000)
        let textoLimpio = texto.replace(/\./g, '').replace(/,/g, '.');
        let match = textoLimpio.match(/\d+(\.\d+)?/);
        
        if (!match) {
            return res.json({ replies: [{ message: "⚠️ Por favor, indica un monto (ej: 10000 pesos)." }] });
        }

        let montoBase = parseFloat(match[0]);

        // 3. LOGICA DEL "MIL"
        if (texto.includes("mil") && montoBase < 1000) {
            montoBase = montoBase * 1000;
        }

        // 4. DETECTAR MONEDA (Mejorado para "dólares" y "bolívares")
        let moneda = "";
        if (/peso|clp|luca/.test(texto)) moneda = "CLP";
        else if (/bs|bolivar|bolívares|bolivares/.test(texto)) moneda = "BS";
        else if (/usd|dolar|dólar|\$/.test(texto)) moneda = "USD";

        if (!moneda) {
            return res.json({ replies: [{ message: "⚠️ Indica si son *Pesos, Dólares o Bolívares*." }] });
        }

        // 5. CÁLCULOS
        let dlar, clp, bs, resp, tasaUsada;
        const bcv_f = BCV.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (moneda === "CLP") {
            clp = montoBase;
            tasaUsada = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            dlar = (clp * tasaUsada) / BCV;
            bs = dlar * BCV;
            resp = `✅ *Cálculo RyR (Desde Pesos)*\n\n🇨🇱 Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP\n📊 Tasa: ${tasaUsada}\n📈 Dólar BCV: ${bcv_f} Bs.\n💵 USD: ${dlar.toFixed(2)}\n\n🇻🇪 *Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs.*`;
        } 
        else if (moneda === "BS") {
            bs = montoBase;
            dlar = bs / BCV;
            let clpProyectado = (dlar * BCV) / T_BASE;
            tasaUsada = clpProyectado >= 250000 ? T_250K : (clpProyectado >= 60000 ? T_60K : T_BASE);
            clp = (dlar * BCV) / tasaUsada;
            resp = `✅ *Cálculo RyR (Desde Bolívares)*\n\n🇻🇪 Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs\n📈 Dólar BCV: ${bcv_f} Bs.\n💵 USD: ${dlar.toFixed(2)}\n\n🇨🇱 *Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP*`;
        } 
        else {
            dlar = montoBase;
            bs = dlar * BCV;
            let clpProyectado = bs / T_BASE;
            tasaUsada = clpProyectado >= 250000 ? T_250K : (clpProyectado >= 60000 ? T_60K : T_BASE);
            clp = bs / tasaUsada;
            resp = `✅ *Cálculo RyR (Desde Dólares)*\n\n💵 Monto: ${dlar.toLocaleString('en-US')} USD\n📈 Dólar BCV: ${bcv_f} Bs.\n\n🇨🇱 Chile: ${Math.round(clp).toLocaleString('es-CL')} CLP\n🇻🇪 Venezuela: ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (e) {
        return res.json({ replies: [{ message: "⚠️ Error en el cálculo. Intenta de nuevo." }] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log("Servidor RyR con Filtro de Chile activo"));