const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

// FUNCIÓN DE LIMPIEZA AGRESIVA
const limpiarNum = (val) => {
    if (!val) return 0;
    // 1. Convertir a string y quitar TODO lo que no sea número, punto o coma
    // Esto elimina comillas ("), símbolos ($), espacios y letras (Bs)
    let n = val.toString().replace(/[^0-9.,]/g, '');
    
    if (!n) return 0;

    // 2. Manejo de formatos: si tiene coma y punto (1.200,50)
    if (n.includes(',') && n.includes('.')) {
        n = n.replace(/\./g, '').replace(',', '.');
    } 
    // 3. Si solo tiene coma (36,50)
    else if (n.includes(',')) {
        n = n.replace(',', '.');
    }

    const resultado = parseFloat(n);
    return isNaN(resultado) ? 0 : resultado;
};

app.post('/', async (req, res) => {
    try {
        const response = await axios.get(SHEET_URL, { timeout: 5000 });
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");

        if (filas.length < 2) throw new Error("La hoja no tiene datos suficientes.");

        // Obtenemos la fila 2 (índice 1)
        const fila2 = filas[1];
        const separador = fila2.includes(';') ? ';' : ',';
        const columnas = fila2.split(separador);

        // Mapeo (B=1, C=2, D=3, F=5)
        const T_BASE  = limpiarNum(columnas[1]); 
        const T_60K   = limpiarNum(columnas[2]);
        const T_250K  = limpiarNum(columnas[3]);
        const BCV     = limpiarNum(columnas[5]);

        // Si fallan los valores principales, damos un error detallado
        if (T_BASE <= 0 || BCV <= 0) {
            throw new Error(`Datos inválidos en Excel. B2 detectado como: ${columnas[1]} | F2 detectado como: ${columnas[5]}`);
        }

        // --- PROCESAMIENTO DE MENSAJE ---
        let rawMessage = req.body.query || req.body.message || "";
        let match = rawMessage.match(/\d+([\d.,]*)/);
        
        if (!match) {
            return res.json({ replies: [{ message: "Indica un monto para calcular. Ejemplo: 100 USD o 50000 pesos." }] });
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
            resp = `💸 *Conversión:* \nEnvías: ${Math.round(clp).toLocaleString('es-CL')} CLP\nTasa: ${t} \nReciben: ${Math.round(bs).toLocaleString('es-VE')} Bs. (${dlar.toFixed(2)} USD)`;
        } else if (esBs) {
            bs = monto;
            dlar = bs / BCV;
            let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            resp = `💸 *Para recibir ${Math.round(bs).toLocaleString('es-VE')} Bs:* \nDebes enviar: ${Math.round(clp).toLocaleString('es-CL')} CLP \nTasa BCV: ${BCV.toFixed(2)} \nEquivale a: ${dlar.toFixed(2)} USD`;
        } else {
            dlar = monto;
            let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            bs = dlar * BCV;
            resp = `💸 *Cálculo para ${dlar} USD:* \nChile: ${Math.round(clp).toLocaleString('es-CL')} CLP \nVenezuela: ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (error) {
        console.error("ERROR CRÍTICO:", error.message);
        return res.json({ replies: [{ message: "⚠️ Error: " + error.message }] });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor RyR activo puerto ${PORT}`));