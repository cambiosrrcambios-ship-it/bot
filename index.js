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
    // 1. FILTRO DE SEGURIDAD (SOLO CHILE)
    let remoteId = req.body.query?.sender || req.body.sender || "";
    
    // Si el remitente NO es de Chile, ignoramos el mensaje por completo
    if (remoteId !== "" && !remoteId.startsWith("56") && !remoteId.startsWith("+56")) {
        return res.json({ replies: [] }); 
    }

    try {
        // 2. OBTENER DATOS DE GOOGLE SHEETS
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const columnas = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const T_BASE = limpiarExcel(columnas[1]);
        const T_60K  = limpiarExcel(columnas[2]);
        const T_250K = limpiarExcel(columnas[3]);
        const BCV    = limpiarExcel(columnas[5]);

        // 3. CAPTURAR EL TEXTO DEL MENSAJE
        let raw = "";
        if (req.body.query && req.body.query.message) raw = req.body.query.message;
        else if (req.body.message) raw = req.body.message;
        else raw = req.body.text || "";
        
        let texto = String(raw).toLowerCase().trim();

        // 4. EXTRAER Y CORREGIR EL MONTO (Ej: "10 mil" o "10.000")
        let textoSinPuntos = texto.replace(/\./g, ''); // "10.000" -> "10000"
        let match = textoSinPuntos.match(/\d+/);
        
        if (!match) {
            return res.json({ replies: [{ message: "⚠️ Por favor, indica si el monto es en *Pesos, Dólares o Bolívares* para poder realizar el cálculo correctamente." }] });
        }

        let montoFinal = parseFloat(match[0]);

        // Si dice "mil" y el número es pequeño, multiplicamos por 1000
        if (texto.includes("mil") && montoFinal < 1000) {
            montoFinal = montoFinal * 1000;
        }

        // 5. DETECTAR MONEDA
        let moneda = "";
        if (texto.includes("peso") || texto.includes("clp") || texto.includes("chile")) moneda = "CLP";
        else if (texto.includes("bs") || texto.includes("bolivar") || texto.includes("bolívaar")) moneda = "BS";
        else if (texto.includes("usd") || texto.includes("dolar") || texto.includes("dólar") || texto.includes("$")) moneda = "USD";

        if (!moneda) {
            return res.json({ replies: [{ message: "⚠️ Por favor, indica si el monto es en *Pesos, Dólares o Bolívares* para poder realizar el cálculo correctamente." }] });
        }

        // 6. REALIZAR CÁLCULOS
        let dlar, clp, bs, resp, tasaActual;
        const bcv_f = BCV.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (moneda === "CLP") {
            clp = montoFinal;
            tasaActual = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            dlar = (clp * tasaActual) / BCV;
            bs = dlar * BCV;
            resp = `✅ *Cálculo RyR (Desde Pesos)*\n\n🇨🇱 Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP\n📊 Tasa: ${tasaActual}\n📈 Dólar BCV: ${bcv_f} Bs.\n💵 USD: ${dlar.toFixed(2)}\n\n🇻🇪 *Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs.*`;
        } 
        else if (moneda === "BS") {
            bs = montoFinal;
            dlar = bs / BCV;
            let clpRef = (dlar * BCV) / T_BASE;
            tasaActual = clpRef >= 250000 ? T_250K : (clpRef >= 60000 ? T_60K : T_BASE);
            clp = (dlar * BCV) / tasaActual;
            resp = `✅ *Cálculo RyR (Desde Bolívares)*\n\n🇻🇪 Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs\n📈 Dólar BCV: ${bcv_f} Bs.\n💵 USD: ${dlar.toFixed(2)}\n\n🇨🇱 *Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP*`;
        } 
        else {
            dlar = montoFinal;
            bs = dlar * BCV;
            let clpRef = bs / T_BASE;
            tasaActual = clpRef >= 250000 ? T_250K : (clpRef >= 60000 ? T_60K : T_BASE);
            clp = bs / tasaActual;
            resp = `✅ *Cálculo RyR (Desde Dólares)*\n\n💵 Monto: ${dlar.toLocaleString('en-US')} USD\n📈 Dólar BCV: ${bcv_f} Bs.\n\n🇨🇱 Chile: ${Math.round(clp).toLocaleString('es-CL')} CLP\n🇻🇪 Venezuela: ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (e) {
        return res.json({ replies: [{ message: "⚠️ Por favor, indica si el monto es en *Pesos, Dólares o Bolívares* para poder realizar el cálculo correctamente." }] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log("Servidor RyR con Filtro de Seguridad"));