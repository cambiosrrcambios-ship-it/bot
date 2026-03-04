const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// REEMPLAZA CON TU ENLACE CSV DE GOOGLE SHEETS
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv"; 

app.post('/', async (req, res) => {
    try {
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/);
        // Fila 2 del Excel (índice 1 en el código)
        const columnas = filas[1].split(','); 

        // Función para limpiar cualquier texto, comillas o espacios y dejar solo el número
        const limpiar = (val) => parseFloat(val.replace(/[^0-9.]/g, ''));

        const T_BASE = limpiar(columnas[1]); // Celda B2
        const T_60K  = limpiar(columnas[2]); // Celda C2
        const T_250K = limpiar(columnas[3]); // Celda D2
        const BCV    = limpiar(columnas[5]); // Celda F2

        // Verificar si los números son válidos
        if (isNaN(T_BASE) || isNaN(BCV)) {
            throw new Error("Datos de tasa no numéricos");
        }

        let rawMessage = req.body.query || req.body.message || "";
        let match = rawMessage.match(/\d+([\d.]*)/);
        if (!match) return res.json({ replies: [{ message: "Indica un monto." }] });

        let monto = parseFloat(match[0].replace(/\./g, ''));
        let esBs = /bs|bolivares|bolívares/i.test(rawMessage);
        let esPesos = /pesos|clp|chilenos/i.test(rawMessage);
        let dlar, clp, bs, resp;

        if (esPesos) {
            clp = monto;
            let t = clp > 249999 ? T_250K : (clp > 59999 ? T_60K : T_BASE);
            dlar = clp / t;
            bs = dlar * BCV;
            resp = Si envías ${clp.toLocaleString('es-CL')} pesos, son ${dlar.toFixed(2)} USD y llegan ${bs.toLocaleString('es-VE', {minimumFractionDigits:2})} Bs.;
        } else if (esBs) {
            bs = monto;
            dlar = bs / BCV;
            let t = (dlar * T_BASE > 249999) ? T_250K : (dlar * T_BASE > 59999 ? T_60K : T_BASE);
            clp = dlar * t;
            resp = Para que lleguen ${bs.toLocaleString('es-VE')} Bs, a BCV (${BCV}) serían ${Math.round(clp).toLocaleString('es-CL')} pesos (${dlar.toFixed(2)} USD).;
        } else {
            dlar = monto;
            let t = (dlar * T_BASE > 249999) ? T_250K : (dlar * T_BASE > 59999 ? T_60K : T_BASE);
            clp = dlar * t;
            bs = dlar * BCV;
            resp = Si necesitas ${dlar} dólares, a BCV (${BCV}) serían ${Math.round(clp).toLocaleString('es-CL')} pesos y llegan ${bs.toLocaleString('es-VE', {minimumFractionDigits:2})} Bs.;
        }
        return res.json({ replies: [{ message: resp }] });

    } catch (error) {
        return res.json({ replies: [{ message: "Error: No pude leer las tasas del Excel. Revisa las celdas B2, C2, D2 y F2." }] });
    }
});

app.get('/', (req, res) => res.send("Servidor Activo ✅"));
app.listen(process.env.PORT || 10000, '0.0.0.0');
