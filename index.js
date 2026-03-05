const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

// Limpieza profunda de caracteres
const limpiarNum = (val) => {
    if (val === undefined || val === null) return 0;
    let n = val.toString().trim();
    // Elimina TODO lo que no sea número, coma o punto
    n = n.replace(/[^0-9.,]/g, '');
    
    // Si después de limpiar queda vacío
    if (!n) return 0;

    // Lógica para convertir formato latino (1.234,55) a internacional (1234.55)
    if (n.includes(',') && n.includes('.')) {
        n = n.replace(/\./g, '').replace(',', '.');
    } else if (n.includes(',')) {
        n = n.replace(',', '.');
    }
    
    return parseFloat(n) || 0;
};

app.post('/', async (req, res) => {
    try {
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");

        if (filas.length < 2) throw new Error("La hoja no tiene datos en la fila 2.");

        const fila2 = filas[1];
        const separador = fila2.includes(';') ? ';' : ',';
        const columnas = fila2.split(separador);

        // --- MAPEO DINÁMICO ---
        // Extraemos los valores limpiando cualquier residuo de comillas o texto
        const T_BASE  = limpiarNum(columnas[1]); // B2
        const T_60K   = limpiarNum(columnas[2]); // C2
        const T_250K  = limpiarNum(columnas[3]); // D2
        const BCV     = limpiarNum(columnas[5]); // F2

        // LOG DE SEGURIDAD: Revisa esto en tu consola de Render/Heroku
        console.log("Valores Crudos:", { B: columnas[1], F: columnas[5] });
        console.log("Valores Limpios:", { T_BASE, BCV });

        if (T_BASE === 0 || BCV === 0) {
            throw new Error(`B2 tiene "${columnas[1]}" y F2 tiene "${columnas[5]}". Asegúrate que sean números.`);
        }

        // --- PROCESAMIENTO DE MENSAJE ---
        let rawMessage = req.body.query || req.body.message || "";
        let match = rawMessage.match(/\d+([\d.,]*)/);
        
        if (!match) {
            return res.json({ replies: [{ message: "Hola! Indica un monto para calcular. Ej: 50000" }] });
        }

        let monto = limpiarNum(match[0]);
        let esBs = /bs|bolivares/i.test(rawMessage);
        let esPesos = /pesos|clp/i.test(rawMessage);
        let dlar, clp, bs, resp;

        if (esPesos) {
            clp = monto;
            let t = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            dlar = clp / t;
            bs = dlar * BCV;
            resp = `Si envías ${Math.round(clp).toLocaleString('es-CL')} CLP, son ${dlar.toFixed(2)} USD y llegan ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        } else if (esBs) {
            bs = monto;
            dlar = bs / BCV;
            let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            resp = `Para recibir ${Math.round(bs).toLocaleString('es-VE')} Bs, a tasa BCV (${BCV.toFixed(2)}) serían ${Math.round(clp).toLocaleString('es-CL')} CLP (${dlar.toFixed(2)} USD).`;
        } else {
            dlar = monto;
            let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            bs = dlar * BCV;
            resp = `Para ${dlar} USD, serían ${Math.round(clp).toLocaleString('es-CL')} CLP y el receptor obtiene ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (error) {
        return res.json({ replies: [{ message: "Revisar Excel: " + error.message }] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor activo en puerto ${PORT}`));