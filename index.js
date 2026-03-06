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
    // --- 1. FILTRO DE SEGURIDAD (CHILE +56) ---
    // Intentamos obtener el número de varias fuentes que envía AutoResponder
    let senderName = req.body.query?.sender || ""; // Puede ser "Soluciones SR"
    let jid = req.body.query?.remoteJid || "";     // Suele ser "56912345678@s.whatsapp.net"
    
    // Extraemos solo los dígitos de ambos
    let numDesdeSender = senderName.replace(/\D/g, '');
    let numDesdeJid = jid.replace(/\D/g, '');
    
    // Elegimos el que parezca un número válido
    let numeroFinal = numDesdeSender.startsWith('56') ? numDesdeSender : numDesdeJid;

    // Si tenemos un número y NO empieza por 56, ignoramos.
    // Si es un nombre (como "Soluciones SR") y no pudimos hallar el número en JID, 
    // lo dejamos pasar por si acaso para que no se quede mudo contigo.
    if (numeroFinal !== "" && !numeroFinal.startsWith("56")) {
        console.log("Mensaje bloqueado: Número de fuera de Chile (" + numeroFinal + ")");
        return res.json({ replies: [] });
    }

    try {
        // --- 2. DATOS DE EXCEL ---
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const columnas = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const T_BASE = limpiarExcel(columnas[1]);
        const T_60K  = limpiarExcel(columnas[2]);
        const T_250K = limpiarExcel(columnas[3]);
        const BCV    = limpiarExcel(columnas[5]);

        // --- 3. PROCESAR MENSAJE ---
        let raw = req.body.query?.message || req.body.message || req.body.text || "";
        let texto = String(raw).toLowerCase().trim();

        // Extraer número quitando puntos (ej: 10.000 -> 10000)
        let match = texto.replace(/\./g, '').match(/\d+/);
        
        if (!match) {
            return res.json({ replies: [{ message: "⚠️ Por favor, indica si el monto es en *Pesos, Dólares o Bolívares* para poder realizar el cálculo correctamente." }] });
        }

        let monto = parseFloat(match[0]);

        // Manejo de "mil" (ej: "10 mil")
        if (texto.includes("mil") && monto < 1000) {
            monto = monto * 1000;
        }

        // --- 4. DETECTAR MONEDA ---
        let moneda = "";
        if (texto.includes("peso") || texto.includes("clp")) moneda = "CLP";
        else if (texto.includes("bs") || texto.includes("bolivar")) moneda = "BS";
        else if (texto.includes("usd") || texto.includes("dolar") || texto.includes("$")) moneda = "USD";

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
app.listen(PORT, '0.0.0.0', () => console.log("Servidor RyR Ejecutándose"));