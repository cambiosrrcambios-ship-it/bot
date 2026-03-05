const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// URL de tu Google Sheet (formato CSV)
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

// Función de limpieza ultra-robusta
const limpiarNum = (val) => {
    if (!val) return 0;
    let n = val.toString().trim();
    n = n.replace(/"/g, '');       // Quita comillas
    n = n.replace(/\./g, '');      // Quita puntos de miles
    n = n.replace(',', '.');       // Convierte coma decimal a punto
    n = n.replace(/[^\d.]/g, '');  // Quita letras o símbolos (Bs, $, etc)
    return parseFloat(n) || 0;
};

app.post('/', async (req, res) => {
    try {
        const response = await axios.get(SHEET_URL);
        // Dividimos por filas y eliminamos las vacías
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");

        if (filas.length < 2) throw new Error("La hoja no tiene suficientes filas (mínimo 2).");

        // Usamos la fila 2 (índice 1)
        const fila2 = filas[1];
        const separador = fila2.includes(';') ? ';' : ',';
        const columnas = fila2.split(separador);

        // --- MAPEO SEGÚN TU EXCEL (A=0, B=1, C=2, D=3, E=4, F=5) ---
        // Si tus datos empiezan en B2, el índice 1 es la columna B.
        const T_BASE  = limpiarNum(columnas[1]); // Columna B
        const T_60K   = limpiarNum(columnas[2]); // Columna C
        const T_250K  = limpiarNum(columnas[3]); // Columna D
        const BCV     = limpiarNum(columnas[5]); // Columna F

        console.log("Datos extraídos de Fila 2:", { T_BASE, T_60K, T_250K, BCV });

        // Validación crítica
        if (T_BASE === 0 || BCV === 0) {
            throw new Error(`Valores en 0. Revisar B2 (leído: ${columnas[1]}) y F2 (leído: ${columnas[5]})`);
        }

        // --- Lógica de Mensajería ---
        let rawMessage = req.body.query || req.body.message || "";
        let match = rawMessage.match(/\d+([\d.,]*)/);
        
        if (!match) {
            return res.json({ replies: [{ message: "Por favor, indica un monto numérico." }] });
        }

        let monto = parseFloat(match[0].replace(/\./g, '').replace(',', '.'));
        let esBs = /bs|bolivares/i.test(rawMessage);
        let esPesos = /pesos|clp/i.test(rawMessage);
        let dlar, clp, bs, resp;

        if (esPesos) {
            clp = monto;
            let t = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            dlar = clp / t;
            bs = dlar * BCV;
            resp = `Si envías ${Math.round(clp).toLocaleString('es-CL')} pesos, son ${dlar.toFixed(2)} USD y llegan ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        } else if (esBs) {
            bs = monto;
            dlar = bs / BCV;
            let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            resp = `Para que lleguen ${Math.round(bs).toLocaleString('es-VE')} Bs, a tasa BCV (${BCV.toFixed(2).replace('.', ',')}) serían ${Math.round(clp).toLocaleString('es-CL')} pesos (${dlar.toFixed(2)} USD).`;
        } else {
            dlar = monto;
            let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            bs = dlar * BCV;
            resp = `Si necesitas ${dlar} USD, a tasa BCV (${BCV.toFixed(2).replace('.', ',')}) serían ${Math.round(clp).toLocaleString('es-CL')} pesos y llegan ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (error) {
        console.error("DEBUG:", error.message);
        return res.json({ replies: [{ message: "Error de configuración: " + error.message }] });
    }
});

app.get('/', (req, res) => res.send("Servidor RyR Listo"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Puerto ${PORT}`));