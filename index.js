const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// URL de publicación en la pestaña "tasas" (formato CSV)
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

/**
 * Función Robusta para limpiar números de Google Sheets
 * Maneja: "36,50", " 1.200,50 ", "$40", "Bs. 56"
 */
const limpiarNum = (val) => {
    if (!val) return 0;
    let n = val.toString().trim();
    n = n.replace(/"/g, ''); // Quita comillas dobles si las hay
    n = n.replace(/\./g, ''); // Quita puntos de miles (ej: 1.200 -> 1200)
    n = n.replace(',', '.');  // Cambia coma decimal por punto (ej: 36,5 -> 36.5)
    n = n.replace(/[^\d.]/g, ''); // Deja solo números y el punto decimal
    let resultado = parseFloat(n);
    return isNaN(resultado) ? 0 : resultado;
};

app.post('/', async (req, res) => {
    try {
        const response = await axios.get(SHEET_URL);
        // Separamos por líneas y quitamos las vacías
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");

        if (filas.length < 2) {
            throw new Error("La hoja de cálculo parece estar vacía o no tiene fila 2.");
        }

        // Detectar separador (Google usa , o ; según la región)
        const separador = filas[1].includes(';') ? ';' : ',';
        const columnas = filas[1].split(separador);

        // --- MAPEO DE COLUMNAS (A=0, B=1, C=2, D=3, E=4, F=5) ---
        const T_BASE  = limpiarNum(columnas[1]); // Columna B (Tasa Base)
        const T_60K   = limpiarNum(columnas[2]); // Columna C (Tasa > 60k)
        const T_250K  = limpiarNum(columnas[3]); // Columna D (Tasa > 250k)
        const BCV     = limpiarNum(columnas[5]); // Columna F (Tasa BCV)

        console.log("Valores procesados con éxito:", { T_BASE, T_60K, T_250K, BCV });

        // Validación de seguridad
        if (T_BASE === 0 || BCV === 0) {
            console.error("Fila 2 detectada:", filas[1]);
            throw new Error(`Datos no válidos en B2 (${columnas[1]}) o F2 (${columnas[5]})`);
        }

        // --- Lógica de Mensajería ---
        let rawMessage = req.body.query || req.body.message || "";
        // Extraer el primer número que aparezca en el mensaje
        let match = rawMessage.match(/\d+([\d.,]*)/);
        
        if (!match) {
            return res.json({ replies: [{ message: "Por favor, indica un monto numérico (ejemplo: 50000)." }] });
        }

        // Limpiar el monto del usuario (maneja "10.000" o "10000")
        let montoStr = match[0].replace(/\./g, '').replace(',', '.');
        let monto = parseFloat(montoStr);
        
        let esBs = /bs|bolivares/i.test(rawMessage);
        let esPesos = /pesos|clp/i.test(rawMessage);
        let dlar, clp, bs, resp;

        if (esPesos) {
            clp = monto;
            // Escala de tasas según el monto en pesos
            let t = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            dlar = clp / t;
            bs = dlar * BCV;
            resp = `Si envías ${Math.round(clp).toLocaleString('es-CL')} pesos, son ${dlar.toFixed(2)} USD y llegan ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        } 
        else if (esBs) {
            bs = monto;
            dlar = bs / BCV;
            // Cálculo inverso para CLP
            let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            resp = `Para que lleguen ${Math.round(bs).toLocaleString('es-VE')} Bs, a tasa BCV (${BCV.toFixed(2).replace('.', ',')}) serían ${Math.round(clp).toLocaleString('es-CL')} pesos (${dlar.toFixed(2)} USD).`;
        } 
        else {
            // Asumimos USD si no especifica
            dlar = monto;
            let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            bs = dlar * BCV;
            resp = `Si necesitas ${dlar} USD, a tasa BCV (${BCV.toFixed(2).replace('.', ',')}) serían ${Math.round(clp).toLocaleString('es-CL')} pesos y llegan ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (error) {
        console.error("Error crítico:", error.message);
        return res.json({ replies: [{ message: "Error: " + error.message }] });
    }
});

app.get('/', (req, res) => res.send("Servidor de Tasas RyR activo v2"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
});