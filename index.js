const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

// Limpiador ultra-agresivo
const limpiar = (v) => {
    if (!v) return 0;
    // Elimina TODO lo que no sea número, punto o coma
    let n = v.toString().replace(/[^0-9.,]/g, '');
    if (n.includes(',') && n.includes('.')) n = n.replace(/\./g, '').replace(',', '.');
    else if (n.includes(',')) n = n.replace(',', '.');
    return parseFloat(n) || 0;
};

app.post('/', async (req, res) => {
    try {
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        
        // Buscamos la fila 2 (donde están tus datos)
        const columnas = filas[1].split(filas[1].includes(';') ? ';' : ',');

        // EXTRAER VALORES: Forzamos la limpieza de cada columna
        // Según tu Excel: B=1, C=2, D=3, F=5
        const T_BASE  = limpiar(columnas[1]);
        const T_60K   = limpiar(columnas[2]);
        const T_250K  = limpiar(columnas[3]);
        const BCV     = limpiar(columnas[5]);

        // VALIDACIÓN DE EMERGENCIA
        // Si el código sigue viendo "0", es que la celda está VACÍA en el CSV
        if (T_BASE <= 0 || BCV <= 0) {
            return res.json({ replies: [{ message: `⚠️ Error de lectura: El bot detecta la celda B2 como [${columnas[1]}] y F2 como [${columnas[5]}]. Por favor, escribe los números de nuevo en Excel y espera 10 segundos.` }] });
        }

        // --- LÓGICA DE CÁLCULO ---
        let raw = req.body.query || req.body.message || "";
        let numMatch = raw.match(/\d+([\d.,]*)/);
        if (!numMatch) return res.json({ replies: [{ message: "Indica un monto, por ejemplo: 50.000" }] });

        let monto = limpiar(numMatch[0]);
        let esBs = /bs|bolivares/i.test(raw);
        let esPesos = /pesos|clp/i.test(raw);
        let dlar, clp, bs, resp;

        if (esPesos) {
            clp = monto;
            let t = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            dlar = clp / t;
            bs = dlar * BCV;
            resp = `✅ *Tasa RyR*\n\nEnvías: ${Math.round(clp).toLocaleString('es-CL')} CLP\nTasa: ${t}\nUSD: ${dlar.toFixed(2)}\n*Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs.*`;
        } else if (esBs) {
            bs = monto;
            dlar = bs / BCV;
            let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            resp = `✅ *Tasa RyR*\n\nPara recibir: ${Math.round(bs).toLocaleString('es-VE')} Bs\nTasa BCV: ${BCV}\n*Debes enviar: ${Math.round(clp).toLocaleString('es-CL')} CLP*`;
        } else {
            dlar = monto;
            let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            bs = dlar * BCV;
            resp = `✅ *Tasa RyR*\n\nPara ${dlar} USD:\nChile: ${Math.round(clp).toLocaleString('es-CL')} CLP\nVenezuela: ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (e) {
        return res.json({ replies: [{ message: "Error: " + e.message }] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Online en puerto ${PORT}`));