const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// 1. URL corregida y bien asignada
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

app.post('/', async (req, res) => {
  try {
    const response = await axios.get(SHEET_URL);
    const filas = response.data.split(/\r?\n/);
    
    // Validar que existan datos en la fila 1
    if (!filas[1]) throw new Error("La hoja de cálculo parece estar vacía.");

    const separador = filas[1].includes(';') ? ';' : ',';
    const columnas = filas[1].split(separador);

    const limpiarNum = (val) => {
      if (!val) return 0;
      let n = parseFloat(val.replace(/[^\d.,]/g, '').replace(',', '.'));
      return isNaN(n) ? 0 : n;
    };

    const T_BASE = limpiarNum(columnas[1]);
    const T_60K = limpiarNum(columnas[2]);
    const T_250K = limpiarNum(columnas[3]);
    const BCV = limpiarNum(columnas[5]);

    console.log("Valores obtenidos:", { T_BASE, T_60K, T_250K, BCV });

    // 2. Condición corregida (sin la URL atravesada)
    if (!T_BASE || !BCV) throw new Error("Datos no encontrados en las celdas");

    let rawMessage = req.body.query || req.body.message || "";
    let match = rawMessage.match(/\d+([\d.]*)/);
    if (!match) return res.json({ replies: [{ message: "Indica un monto numérico." }] });

    let monto = parseFloat(match[0].replace(/\./g, '')); 
    let esBs = /bs|bolivares/i.test(rawMessage);
    let esPesos = /pesos|clp/i.test(rawMessage);
    let dlar, clp, bs, resp;

    if (esPesos) {
      clp = monto;
      let t = clp > 249999 ? T_250K : (clp > 59999 ? T_60K : T_BASE);
      dlar = clp / t;
      bs = dlar * BCV;
      resp = `Si envias ${Math.round(clp).toLocaleString('es-CL')} pesos, son ${dlar.toFixed(2)} USD y llegan ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
    } else if (esBs) {
      bs = monto;
      dlar = bs / BCV;
      let t = (dlar * T_BASE > 249999) ? T_250K : (dlar * T_BASE > 59999 ? T_60K : T_BASE);
      clp = dlar * t;
      resp = `Para que lleguen ${Math.round(bs).toLocaleString('es-VE')} Bs, a tasa BCV (${BCV}) serian ${Math.round(clp).toLocaleString('es-CL')} pesos (${dlar.toFixed(2)} USD).`;
    } else {
      dlar = monto;
      let t = (dlar * T_BASE > 249999) ? T_250K : (dlar * T_BASE > 59999 ? T_60K : T_BASE);
      clp = dlar * t;
      bs = dlar * BCV;
      resp = `Si necesitas ${dlar} dolares, a tasa BCV (${BCV}) serian ${Math.round(clp).toLocaleString('es-CL')} pesos y llegan ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
    }

    return res.json({ replies: [{ message: resp }] });

  } catch (error) {
    console.error("Error en el servidor:", error.message);
    return res.json({ replies: [{ message: "Error: " + error.message }] });
  }
});

app.get('/', (req, res) => res.send("Servidor activo OK"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});