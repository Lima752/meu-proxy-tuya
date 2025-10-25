// /api/proxy.js
// *** ATUALIZADO para lidar com OPTIONS (CORS) ***
import crypto from 'crypto';

// Função auxiliar para definir cabeçalhos CORS
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*'); // Permite qualquer origem
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tuya-Method, X-Tuya-Path');
}

export default async function handler(req, res) {

    // --- Responde ao Preflight OPTIONS ---
    if (req.method === 'OPTIONS') {
        setCorsHeaders(res); // Define os cabeçalhos de permissão
        return res.status(204).end(); // Responde 204 No Content (padrão para OPTIONS)
    }

    // --- Define cabeçalhos CORS para a resposta real ---
    setCorsHeaders(res);

    // --- Lógica normal do proxy ---
    const accessToken = req.headers.authorization?.split(' ')[1];
    const tuyaPath = req.headers['x-tuya-path'];
    const tuyaMethod = req.headers['x-tuya-method'] || 'GET';
    const body = req.body;

    const clientId = process.env.TUYA_CLIENT_ID;
    const secretKey = process.env.TUYA_SECRET_KEY;

    if (!accessToken || !tuyaPath || !clientId || !secretKey) {
        return res.status(400).json({ code: 400, msg: 'Faltando cabeçalhos ou configuração.' });
    }

    const t = Date.now().toString();
    // Garante que body seja um objeto antes de verificar as chaves
    const safeBody = (typeof body === 'object' && body !== null) ? body : {};
    const bodyString = Object.keys(safeBody).length === 0 ? '' : JSON.stringify(safeBody);
    const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');

    const headersToSign = "";
    const stringToSign =
        clientId + accessToken + t + tuyaMethod + '\n' +
        bodyHash + '\n' +
        headersToSign + '\n' +
        tuyaPath;

    const sign = crypto.createHmac('sha256', secretKey)
                       .update(stringToSign)
                       .digest('hex')
                       .toUpperCase();

    const url = `https://openapi.tuyaus.com${tuyaPath}`;
    const tuyaHeaders = {
        'client_id': clientId,
        'access_token': accessToken,
        'sign': sign,
        't': t,
        'sign_method': 'HMAC-SHA256',
        'Content-Type': 'application/json'
    };

    try {
        const response = await fetch(url, {
            method: tuyaMethod,
            headers: tuyaHeaders,
            body: bodyString === '' ? null : bodyString
        });
        const data = await response.json();
        // Retorna o status original da Tuya
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ code: 500, msg: 'Erro interno do proxy', error: error.message });
    }
}
