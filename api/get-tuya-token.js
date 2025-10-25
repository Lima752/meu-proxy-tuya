// /api/get-tuya-token.js
// *** ATUALIZADO para lidar com OPTIONS (CORS) ***
import crypto from 'crypto';

// Função auxiliar para definir cabeçalhos CORS
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*'); // Permite qualquer origem
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); // Apenas GET e OPTIONS aqui
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); // Cabeçalhos permitidos
}

export default async function handler(req, res) {

    // --- Responde ao Preflight OPTIONS ---
    if (req.method === 'OPTIONS') {
        setCorsHeaders(res);
        return res.status(204).end();
    }

    // --- Define cabeçalhos CORS para a resposta real ---
    setCorsHeaders(res);

    // --- Lógica normal para obter o token ---
    if (req.method !== 'GET') {
         return res.status(405).json({ msg: 'Method Not Allowed'});
    }

    const t = Date.now().toString();
    const clientId = process.env.TUYA_CLIENT_ID;
    const secretKey = process.env.TUYA_SECRET_KEY;

    if (!clientId || !secretKey) {
         return res.status(500).json({ msg: 'Server configuration error'});
    }

    const baseUrl = "https://openapi.tuyaus.com";
    const path = "/v1.0/token?grant_type=1";
    const url = baseUrl + path;

    function signHMAC(message, secretKey) {
        const hmac = crypto.createHmac('sha256', secretKey);
        hmac.update(message);
        return hmac.digest('hex');
    }

    const httpMethod = "GET";
    const emptyBodyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const headersToSign = "";
    const message = clientId + t + httpMethod + "\n" +
                    emptyBodyHash + "\n" +
                    headersToSign + "\n" +
                    path;

    const signature = signHMAC(message, secretKey);
    const sign = signature.toString().toUpperCase();
    const signMethod = "HMAC-SHA256";

    const headers = {
        "client_id": clientId,
        "sign": sign,
        "t": t,
        "sign_method": signMethod
    };

    try {
        const response = await fetch(url, { method: httpMethod, headers: headers });
        const data = await response.json();
        // Retorna o status original da Tuya
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ code: 500, msg: "Erro interno do servidor", error: error.message });
    }
}
