const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQkqLB77VTOC1HOnc44gMV-T3mzayeqRm10--wC2Xr9PzHTN7lfqdMrAH0oZ0m5-eVEndK26yn2jwT7/pub?gid=1244806406&single=true&output=csv";

const limpiar = (v) => {
    if (!v) return 0;
    let n = v.toString().replace(/[^0-9.,]/g, '');
    if (!n) return 0;
    if (n.includes(',') && n.includes('.')) n = n.replace(/\./g, '').replace(',', '.');
    else if (n.includes(',')) n = n.replace(',', '.');
    return parseFloat(n) || 0;
};

app.post('/', async (req, res) => {
    try {
        // 1. OBTENER TASAS DESDE GOOGLE
        const response = await axios.get(SHEET_URL);
        const filas = response.data.split(/\r?\n/).filter(f => f.trim() !== "");
        const columnas = filas[1].split(filas[1].includes(';') ? ';' : ',');

        const T_BASE  = limpiar(columnas[1]);
        const T_60K   = limpiar(columnas[2]);
        const T_250K  = limpiar(columnas[3]);
        const BCV     = limpiar(columnas[5]);

        // 2. BUSCAR EL TEXTO (Aquí estaba el fallo)
        // Revisamos el body completo para encontrar cualquier texto que el usuario haya enviado
        let raw = "";
        
        // Esta función busca texto en cualquier propiedad del JSON recibido
        const buscarTexto = (obj) => {
            for (let key in obj) {
                if (typeof obj[key] === 'string' && obj[key].length > 1) return obj[key];
                if (typeof obj[key] === 'object') {
                    let res = buscarTexto(obj[key]);
                    if (res) return res;
                }
            }
            return "";
        };

        raw = buscarTexto(req.body) || "";
        console.log("Mensaje detectado:", raw);

        // Intentar sacar el número
        let numMatch = raw.match(/\d+([\d.,]*)/);
        
        if (!numMatch || raw === "") {
            return res.json({ 
                replies: [{ message: "¡Hola! 💸 No logré entender el monto.\n\nEscribe por ejemplo: '20 usd' o '50000 pesos'." }] 
            });
        }

        // 3. CÁLCULOS
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
            let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
            clp = dlar * t;
            resp = `✅ *Cálculo RyR*\n\n🇻🇪 Para recibir: ${Math.round(bs).toLocaleString('es-VE')} Bs\n📊 Tasa BCV: ${BCV.toFixed(2)}\n💵 Equivale a: ${dlar.toFixed(2)} USD\n\n🇨🇱 *Debes enviar: ${Math.round(clp).toLocaleString('es-CL')} CLP*`;
        } else {
            dlar = monto;
            let t = (dlar * T_BASE >= 250000) ? T_250K : (dlar * T_BASE >= 60000 ? T_60K : T_BASE);
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
app.listen(PORT, '0.0.0.0', () => console.log("Servidor RyR en línea"));