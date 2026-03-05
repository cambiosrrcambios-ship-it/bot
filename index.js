const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// URL de tu Google Sheet (asegúrate de que esté publicada como CSV)
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

// FUNCIÓN PARA LIMPIAR NÚMEROS (Maneja comillas, puntos y comas)
const limpiar = (v) => {
    if (!v) return 0;
    // Eliminamos todo lo que no sea número, punto o coma
    let n = v.toString().replace(/[^0-9.,]/g, '');
    if (!n) return 0;

    // Si tiene coma y punto (ej: 1.200,50), quitamos el punto y usamos la coma como decimal
    if (n.includes(',') && n.includes('.')) {
        n = n.replace(/\./g, '').replace(',', '.');
    } 
    // Si solo tiene coma (ej: 36,50), la convertimos en punto
    else if (n.includes(',')) {
        n = n.replace(',', '.');
    }
    
    const resultado = parseFloat(n);
    return isNaN(resultado) ? 0 : resultado;
};

app.post('/', async (req, res) => {
    try {
        // 1. LEER DATOS DE GOOGLE SHEETS
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        
        if (filas.length < 2) throw new Error("Excel sin datos suficientes en fila 2.");

        const fila2 = filas[1];
        const separador = fila2.includes(';') ? ';' : ',';
        const columnas = fila2.split(separador);

        // Mapeo de columnas: B=1, C=2, D=3, F=5
        const T_BASE  = limpiar(columnas[1]);
        const T_60K   = limpiar(columnas[2]);
        const T_250K  = limpiar(columnas[3]);
        const BCV     = limpiar(columnas[5]);

        // Verificación de seguridad
        if (T_BASE <= 0 || BCV <= 0) {
            throw new Error(`Valores en 0. B2:[${columnas[1]}] F2:[${columnas[5]}]`);
        }

        // 2. EXTRAER EL MENSAJE DEL CHAT (Detección de plataforma)
        // Intentamos encontrar el texto en cualquier campo posible
        let raw = "";
        if (req.body.text) raw = req.body.text;
        else if (req.body.query) raw = req.body.query;
        else if (req.body.message) raw = req.body.message;
        else if (req.body.content) raw = req.body.content;
        else if (req.body.body) raw = req.body.body;
        
        raw = String(raw); // Forzamos que sea texto

        // Buscamos un número en el mensaje
        let numMatch = raw.match(/\d+([\d.,]*)/);
        
        if (!numMatch || raw === "undefined" || raw === "") {
            return res.json({ replies: [{ message: "¡Hola! 💸 Indica un monto para calcular.\n\nEjemplos:\n- 50000 pesos\n- 100 usd\n- 5000 bs" }] });
        }

        // 3. LÓGICA DE CONVERSIÓN
        let monto = limpiar(numMatch[0]);
        let esBs = /bs|bolivares/i.test(raw);
        let esPesos = /pesos|clp/i.test(raw);
        let dlar, clp, bs, resp;

        if (esPesos) {
            clp = monto;
            let t = clp >= 250000 ? T_250K : (clp >= 60000 ? T_60K : T_BASE);
            dlar = clp / t;
            bs = dlar * BCV;
            resp = `✅ *Cálculo RyR*\n\n🇨🇱 Envías: ${Math.round(clp).toLocaleString('es-CL')} CLP\n📊 Tasa: ${t}\n💵 USD: ${dlar.toFixed(2)}\n\n🇻🇪 *Reciben: ${Math.round(bs).toLocaleString('es-VE')} Bs.*`;
        } else if (esBs) {
            bs = monto;
            dlar = bs / BCV;
            // Para saber la tasa CLP, simulamos el envío en dólares
            let montoClpEquivalente = dlar * T_BASE;
            let t = montoClpEquivalente >= 250000 ? T_250K : (montoClpEquivalente >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            resp = `✅ *Cálculo RyR*\n\n🇻🇪 Para recibir: ${Math.round(bs).toLocaleString('es-VE')} Bs\n📊 Tasa BCV: ${BCV.toFixed(2)}\n💵 Equivale a: ${dlar.toFixed(2)} USD\n\n🇨🇱 *Debes enviar: ${Math.round(clp).toLocaleString('es-CL')} CLP*`;
        } else {
            dlar = monto;
            let montoClpEquivalente = dlar * T_BASE;
            let t = montoClpEquivalente >= 250000 ? T_250K : (montoClpEquivalente >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            bs = dlar * BCV;
            resp = `✅ *Cálculo RyR*\n\n💵 Monto: ${dlar} USD\n\n🇨🇱 Chile: ${Math.round(clp).toLocaleString('es-CL')} CLP\n🇻🇪 Venezuela: ${Math.round(bs).toLocaleString('es-VE')} Bs.`;
        }

        return res.json({ replies: [{ message: resp }] });

    } catch (error) {
        console.error("Error detectado:", error.message);
        return res.json({ replies: [{ message: "⚠️ Error de conexión: " + error.message }] });
    }
});

app.get('/', (req, res) => res.send("Servidor de Tasas RyR activo y funcionando."));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
});