const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// URL con el GID específico de tu pestaña de "tasas"
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

app.post('/', async (req, res) => {
  try {
    const response = await axios.get(SHEET_URL);
    // Limpiamos filas vacías
    const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
    
    if (filas.length < 2) throw new Error("La hoja de cálculo no tiene datos en la fila 2.");

    // Detectamos si Google usa coma o punto y coma como separador de columnas
    const separador = filas[1].includes(';') ? ';' : ',';
    const columnas = filas[1].split(separador);

    // FUNCIÓN DE LIMPIEZA: Maneja decimales con coma (ej: 56,50 -> 56.5)
    const limpiarNum = (val) => {
      if (!val) return 0;
      let n = val.trim();
      n = n.replace(',', '.'); // Convertimos coma decimal a punto
      n = n.replace(/[^\d.]/g, ''); // Quitamos cualquier símbolo extra (Bs, $, etc)
      let resultado = parseFloat(n);
      return isNaN(resultado) ? 0 : resultado;
    };

    // Asignación según tus columnas (B2, C2, D2, F2)
    const T_BASE  = limpiarNum(columnas[1]); 
    const T_60K   = limpiarNum(columnas[2]);
    const T_250K  = limpiarNum(columnas[3]);
    const BCV     = limpiarNum(columnas[5]);

    console.log("Valores procesados:", { T_BASE, T_60K, T_250K, BCV });

    if (!T_BASE || !BCV) {
      throw new Error(`Datos no válidos. Verifica que las celdas B2 y F2 tengan números.`);
    }

    // --- Lógica de Mensajería ---
    let rawMessage = req.body.query || req.body.message || "";
    let match = rawMessage.match(/\d+([\d.]*)/);
    
    if (!match) {
      return res.json({ replies: [{ message: "Por favor, indica un monto numérico para realizar el cálculo." }] });
    }

    let monto = parseFloat(match[0].replace(/\./g, '')); 
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
    } else if (esBs) {
      bs = monto;
      dlar = bs / BCV;
      // Calculamos cuánto CLP se necesita para esos dólares
      let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
      clp = dlar * t;
      resp = `Para que lleguen ${Math.round(bs).toLocaleString('es-VE')} Bs, a tasa BCV (${BCV.toString().replace('.', ',')}) serían ${Math.round(clp).toLocaleString('es-CL')} pesos (${dlar.toFixed(2)} USD).`;
    } else {
      dlar = monto;
      let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
      clp = dlar * t;
      bs = dlar * BCV;
      resp = `Si necesitas ${dlar} dólares, a tasa BCV (${BCV.toString().replace('.', ',')}) serían ${Math.round(clp).toLocaleString('es-CL')} pesos y llegan ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
    }

    return res.json({ replies: [{ message: resp }] });

  } catch (error) {
    console.error("Error crítico:", error.message);
    return res.json({ replies: [{ message: "Error de conexión: " + error.message }] });
  }
});

app.get('/', (req, res) => res.send("Servidor de Tasas RyR activo"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});