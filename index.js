const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

// Función para limpiar números
const limpiar = (v) => {
    if (!v) return 0;
    let n = v.toString().replace(/[^0-9.,]/g, '');
    if (n.includes(',') && n.includes('.')) n = n.replace(/\./g, '').replace(',', '.');
    else if (n.includes(',')) n = n.replace(',', '.');
    return parseFloat(n) || 0;
};

app.post('/', async (req, res) => {
    try {
        // 1. OBTENER DATOS DE EXCEL
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const columnas = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const T_BASE  = limpiar(columnas[1]);
        const T_60K   = limpiar(columnas[2]);
        const T_250K  = limpiar(columnas[3]);
        const BCV     = limpiar(columnas[5]);

        // 2. EXTRAER EL MENSAJE (Ruta exacta según tu DEBUG)
        let raw = "";
        if (req.body.query && req.body.query.message) {
            raw = String(req.body.query.message); 
        } else {
            // Backup por si cambia el formato
            raw = String(req.body.message || req.body.text || "");
        }

        console.log("Mensaje procesado:", raw);

        // 3. BUSCAR NÚMERO
        let numMatch = raw.match(/\d+([\d.,]*)/);
        
        if (!numMatch) {
            return res.json({ replies: [{ message: "¡Hola! 💸 Indica un monto para calcular.\nEjemplo: 20 usd o 50000 pesos." }] });
        }

        let monto = limpiar(numMatch[0]);
        let esBs = /bs|bolivares/i.test(raw);
        let esPesos = /pesos|clp/i.test(raw);
        let dlar, clp, bs, resp;

        // 4. LÓGICA DE CÁLCULO
        if (esPesos) {
            clp = monto;
            let t = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            dlar = clp / t;
            bs = dlar * BCV;
            resp = `✅ *Cálculo RyR*\n\n🇨🇱 Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP\n📊 Tasa: ${t}\n💵 USD: ${dlar.toFixed(2)}\n\n🇻🇪 *Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs.*`;
        } else if (esBs) {
            bs = monto;
            dlar = bs / BCV;
            let montoClpEquiv = dlar * T_BASE;
            let t = montoClpEquiv >= 250000 ? T_250K : (montoClpEquiv >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            resp = `✅ *Cálculo RyR*\n\n🇻🇪 Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs\n📊 BCV: ${BCV.toFixed(2)}\n💵 USD: ${dlar.toFixed(2)}\n\n🇨🇱 *Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP*`;
        } else {
            dlar = monto;
            let montoClpEquiv = dlar * T_BASE;
            let t = montoClpEquiv >= 250000 ? T_250K : (montoClpEquiv >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            bs = dlar * BCV;
            resp = `✅ *Cálculo RyR*\n\n💵 Monto: ${dlar} USD\n\n🇨🇱 Chile: ${Math.round(clp).toLocaleString('es-CL')} CLP\n🇻🇪 Venezuela: ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (error) {
        return res.json({ replies: [{ message: "⚠️ Error: " + error.message }] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log("Servidor RyR Listo para AutoResponder"));