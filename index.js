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
    // 1. LOG DE ENTRADA (Para ver en Render siempre)
    console.log("--- NUEVA PETICIÓN RECIBIDA ---");
    console.log("Cuerpo recibido:", JSON.stringify(req.body));

    try {
        // 2. FILTRO DE CHILE RIGUROSO
        // Extraemos el remitente de cualquier lugar posible del JSON
        let senderRaw = req.body.query?.sender || req.body.sender || req.body.contact || "";
        
        // Limpiamos el número: quitamos "+", espacios y letras
        let numeroLimpio = senderRaw.toString().replace(/\D/g, ''); 
        
        console.log(`DEBUG: Remitente: ${senderRaw} -> Número Limpio: ${numeroLimpio}`);

        // Si el número tiene contenido y NO empieza por 56, ignoramos
        if (numeroLimpio !== "" && !numeroLimpio.startsWith("56")) {
            console.log("BLOQUEADO: El número no es de Chile.");
            return res.json({ replies: [] }); 
        }

        // 3. OBTENER EL TEXTO DEL MENSAJE
        let rawMsg = req.body.query?.message || req.body.message || req.body.text || "";
        let texto = String(rawMsg).toLowerCase().trim();
        console.log("Mensaje a procesar:", texto);

        // 4. DESCARGAR DATOS DE GOOGLE SHEETS
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const columnas = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const T_BASE = limpiarExcel(columnas[1]);
        const T_60K  = limpiarExcel(columnas[2]);
        const T_250K = limpiarExcel(columnas[3]);
        const BCV    = limpiarExcel(columnas[5]);

        // 5. EXTRAER MONTO (Detecta 10000, 10.000, 10,5)
        let textoParaMonto = texto.replace(/\./g, '').replace(/,/g, '.');
        let matchMonto = textoParaMonto.match(/\d+(\.\d+)?/);
        
        if (!matchMonto) {
            console.log("ERROR: No se encontró un número en el mensaje.");
            return res.json({ replies: [{ message: "⚠️ Por favor, indica un monto. Ejemplo: *10000 pesos* o *50 dolares*." }] });
        }

        let montoBase = parseFloat(matchMonto[0]);
        if (texto.includes("mil") && montoBase < 1000) montoBase *= 1000;

        // 6. DETECTAR MONEDA
        let moneda = "";
        if (/peso|clp|luca/.test(texto)) moneda = "CLP";
        else if (/bs|bolivar|bolívares|bolivares/.test(texto)) moneda = "BS";
        else if (/usd|dolar|dólar|\$/.test(texto)) moneda = "USD";

        if (!moneda) {
            console.log("ERROR: Moneda no detectada.");
            return res.json({ replies: [{ message: "⚠️ ¿En qué moneda es el monto? (Pesos, Dólares o Bolívares)" }] });
        }

        // 7. CÁLCULOS
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

        console.log("RESPUESTA ENVIADA EXITOSAMENTE");
        return res.json({ replies: [{ message: resp }] });

    } catch (e) {
        console.error("ERROR CRÍTICO:", e.message);
        return res.json({ replies: [{ message: "⚠️ Lo siento, tuve un problema técnico.