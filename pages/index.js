// /pages/index.js
// --- CÓDIGO ATUALIZADO (v11) ---
// Redesenha a UI estilo Nexxto/VDS com Chart.js e adaptador de data

import React, { useEffect, useMemo, useRef, useState } from "react";
// Importações para o Chart.js
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale, // Importa TimeScale
  Filler, // Para preenchimento abaixo da linha
} from 'chart.js';
import 'chartjs-adapter-date-fns'; // Importa o adaptador de data
import { ptBR } from 'date-fns/locale'; // Importa locale pt-BR

// Registra os componentes do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale, // Registra TimeScale
  Filler    // Registra Filler
);

/** ========= CONFIG ========= */
const DEVICES = [
  { id: "eb798cab6fd0612ab95jwc", name: "Sala-T5" },
  { id: "eb4834395c8fbc4dfefpe9", name: "Sala-T4" },
  { id: "eb13a02df36c15cc0czqmm", name: "Sala-T3" },
  { id: "eb08f82b6ddb5a1699dced", name: "Sala-T2" },
  // Adicione mais IDs reais aqui, remova os placeholders
];

const DEFAULT_REFRESH_SECONDS = 300; // 5 minutos
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const HISTORY_MAX_POINTS = 288; // (24h * 60min / 5min por ponto) -> Ajuste conforme refresh

/** ========= HELPERS (LÓGICA - NÃO MEXER) ========= */
function scaleNormalize(value, meta) {
  if (meta?.type === "Integer") {
    let conf = {};
    if (typeof meta.values === 'string') {
        try { conf = JSON.parse(meta.values || "{}"); } catch { conf = {}; }
    } else if (typeof meta.values === 'object' && meta.values !== null) {
        conf = meta.values;
    }
    const scale = Number(conf.scale ?? 0); // Usa ?? para fallback 0
    if (Number.isFinite(value) && Number.isFinite(scale) && scale > 0) {
      return value / Math.pow(10, scale);
    }
  }
  return value;
}
async function getAccessToken() {
  const r = await fetch("/api/get-tuya-token");
  const j = await r.json();
  if (j?.success && j?.result?.access_token) return j.result.access_token;
  throw new Error(j?.msg || "Falha ao obter access_token");
}
async function tuyaProxy({ token, tuyaPath, method = "GET", body = {} }) {
  const r = await fetch("/api/proxy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Tuya-Method": method,
      "X-Tuya-Path": tuyaPath,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await r.json();
  // Retorna status e dados. Os cabeçalhos CORS serão definidos na API Route.
  return { status: r.status, data };
}
function prefer(keys, statusArr) {
  const map = new Map((statusArr || []).map((s) => [s.code, s.value]));
  for (const k of keys) if (map.has(k)) return { code: k, value: map.get(k) };
  // Fallback mais robusto (ignora case)
  const lowerCaseMap = new Map((statusArr || []).map(s => [s.code.toLowerCase(), s.value]));
  for (const k of keys) {
      if (lowerCaseMap.has(k.toLowerCase())) {
          const original = (statusArr || []).find(s => s.code.toLowerCase() === k.toLowerCase());
          return { code: original.code, value: original.value };
      }
  }
  return null;
}
function loadHistory(deviceId) {
  if (typeof window === "undefined") return [];
  try {
      const stored = localStorage.getItem(`history:${deviceId}`);
      // Valida se o que foi carregado é um array
      const parsed = JSON.parse(stored || "[]");
      return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveHistory(deviceId, arr) {
  if (typeof window === "undefined" || !Array.isArray(arr)) return;
  try { localStorage.setItem(`history:${deviceId}`, JSON.stringify(arr)); } catch {}
}

/** ========= ESTILOS (Inspirado no Nexxto/VDS) ========= */
const styles = {
  page: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    backgroundColor: "#eef2f7", // Fundo cinza azulado
    margin: 0,
    padding: "15px",
    minHeight: "100vh",
  },
  header: {
    backgroundColor: "#ffffff", // Cabeçalho branco
    color: "#333",
    padding: "12px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
  },
  headerTitle: {
      fontSize: "1.3rem",
      fontWeight: 600,
      color: '#1e3a8a', // Azul escuro
  },
  headerControls: {
      fontSize: 13,
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
      color: '#555',
  },
  selectControl: {
      marginLeft: 5,
      fontSize: 13,
      border: '1px solid #ccc',
      borderRadius: '4px',
      padding: '3px 5px',
      background: 'transparent',
      cursor: 'pointer',
  },
  buttonControl: {
      marginLeft: 10,
      padding: "5px 10px",
      fontSize: 13,
      cursor: 'pointer',
      background: '#2563eb', // Azul Vercel
      border: 'none',
      color: 'white',
      borderRadius: 5,
      transition: 'background 0.2s',
  },
  container: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", // Cards um pouco maiores
    gap: "20px",
    maxWidth: 1800, // Mais largo
    margin: "0 auto",
  },
  card: {
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 3px 6px rgba(0,0,0,0.08)",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    transition: "opacity 0.3s ease-in-out",
    opacity: 1,
    borderLeft: '4px solid transparent', // Borda para status
  },
  cardOk: { borderLeftColor: '#4CAF50' },
  cardWarn: { borderLeftColor: '#ff9800' },
  cardError: { borderLeftColor: '#f44336' },
  cardOffline: { opacity: 0.7, borderLeftColor: '#aaa' },
  cardHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center', // Alinha verticalmente
      marginBottom: '12px',
  },
  cardTitle: {
    color: "#1e3a8a", // Azul escuro
    fontSize: "1.15rem",
    fontWeight: 600,
    margin: 0,
  },
  cardSubTitle: { fontSize: '0.75rem', color: '#667', marginTop: '3px' },
  statusIcons: { display: 'flex', gap: '8px', alignItems: 'center'},
  iconBase: { fontSize: '1.2rem' },
  onlineIcon: { color: '#4CAF50' }, // Verde
  offlineIcon: { color: '#aaa' }, // Cinza
  batteryIconLow: { color: '#f44336' }, // Vermelho
  batteryIconOk: { color: '#4CAF50' }, // Verde
  mainData: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '15px',
    margin: "20px 0",
  },
  tempBlock: { textAlign: 'center' },
  tempValue: {
    fontSize: "2.8rem",
    fontWeight: 700,
    color: '#1e3a8a', // Azul escuro
    lineHeight: 1,
  },
  tempUnit: { fontSize: "1.2rem", color: "#555", marginLeft: '2px'},
  otherData: { display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', color: '#444' },
  dataPair: { display: 'flex', alignItems: 'center', gap: '5px'},
  chartContainer: {
    marginTop: "15px",
    height: "120px", // Gráfico um pouco menor
    position: 'relative',
  },
  statusText: {
    marginTop: "15px",
    textAlign: "center",
    fontSize: "0.8rem",
    color: "#555",
  },
  statusTextOk: { color: '#388E3C' }, // Verde escuro
  statusTextWarn: { color: '#EF6C00' }, // Laranja
  statusTextError: { color: '#D32F2F' }, // Vermelho escuro
  globalError: {
    color: "#D32F2F",
    fontWeight: "bold",
    marginTop: 20,
    padding: "12px",
    background: "#FFEBEE",
    border: "1px solid #FFCDD2",
    borderRadius: "8px",
    textAlign: "center",
    maxWidth: '800px',
    margin: "0 auto 20px auto",
  },
};

/** ========= COMPONENTE DE GRÁFICO (Inspirado no Nexxto) ========= */
function HistoryChart({ historyData }) {
  const chartData = useMemo(() => {
      const labels = (historyData || []).map(p => p.t);
      const tempData = (historyData || []).map(p => p.temp);
      return {
          labels: labels,
          datasets: [
              {
                  label: 'Temperatura',
                  data: tempData,
                  borderColor: '#2a7ae2', // Azul Nexxto
                  backgroundColor: 'rgba(42, 122, 226, 0.1)',
                  borderWidth: 2, // Linha um pouco mais grossa
                  tension: 0.3,   // Curva suave
                  pointRadius: 0,
                  fill: true,
              },
          ],
      };
  }, [historyData]);

  const chartOptions = useMemo(() => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
          legend: { display: false },
          tooltip: {
              enabled: true,
              mode: 'index', // Mostra todos os pontos no mesmo timestamp
              intersect: false,
              callbacks: { // Formata o tooltip
                  title: (tooltipItems) => {
                      const date = new Date(tooltipItems[0].parsed.x);
                      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' - ' + date.toLocaleDateString('pt-BR');
                  },
                  label: (tooltipItem) => {
                      return ` Temp: ${tooltipItem.formattedValue} °C`;
                  }
              }
          }
      },
      scales: {
          x: {
              type: 'time',
              adapters: { date: { locale: ptBR } }, // Usa locale pt-BR
              time: {
                  unit: 'hour',
                  tooltipFormat: 'dd/MM/yyyy HH:mm', // Formato completo no tooltip
                  displayFormats: { hour: 'HH:mm' } // Apenas hora no eixo
              },
              ticks: { maxTicksLimit: 7, color: '#666', font: {size: 10} },
              grid: { display: false },
          },
          y: {
              beginAtZero: false,
              grid: { color: '#e0e0e0' }, // Linhas de grid mais suaves
              ticks: {
                  color: '#666', font: {size: 10},
                  callback: value => `${value}°` // Adiciona ° no eixo Y
              },
              position: 'left',
          },
      },
      interaction: { intersect: false, mode: 'index' },
      elements: { line: { borderWidth: 2 } } // Garante a espessura da linha
  }), []);

  // Verifica se há dados suficientes
  const hasEnoughData = historyData && historyData.length >= 2;

  return (
    <div style={styles.chartContainer}>
      {!hasEnoughData ? (
          <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40px', fontSize: '0.8rem' }}>
              {devMeta && devMeta.id.startsWith("COLE_O_ID_") ? 'Dispositivo não configurado' : 'Aguardando mais dados para o gráfico...'}
          </div>
      ) : (
          <Line options={chartOptions} data={chartData} />
      )}
    </div>
  );
}


/** ========= COMPONENTE DO CARD (Redesenhado) ========= */
function DeviceCard({ devMeta, historyData }) {
  const metrics = devMeta.metrics || { tVal: null, hVal: null, bVal: null };
  const { tVal, hVal, bVal, lowBattery } = metrics; // Inclui lowBattery

  const isLoading = devMeta.loading;
  const isOffline = devMeta.online === false;
  // Erro = Falha na API OU Offline OU ID não configurado
  const isError = !isLoading && (!devMeta.ok || isOffline || devMeta.id.startsWith("COLE_O_ID_"));
  // Alerta = Bateria baixa (outros alertas desativados)
  const hasAlert = !isError && lowBattery;

  let statusText = "A carregar...";
  let cardStyle = {...styles.card}; // Começa sem borda especial

  if (!isLoading) {
    if (isError) {
      statusText = isOffline ? "Offline" : `Erro: ${devMeta.err || 'Desconhecido'}`;
      cardStyle = {...cardStyle, ...(isOffline ? styles.cardOffline : styles.cardError)};
    } else if (hasAlert) {
      statusText = "Bateria Baixa";
      cardStyle = {...cardStyle, ...styles.cardWarn}; // Borda Laranja para alerta
    } else {
      statusText = "Online";
      cardStyle = {...cardStyle, ...styles.cardOk}; // Borda Verde para OK
    }
  }

  const tempStr = isLoading ? "--" : (typeof tVal === "number" ? tVal.toFixed(1) : "--");
  const humStr = isLoading ? "--" : (typeof hVal === "number" ? hVal.toFixed(0) : "--");
  const batStr = isLoading ? "--" : (typeof bVal === "number" ? `${bVal}%` : "--");


  // --- Prepara dados para o gráfico ---
  const chartData = useMemo(() => {
    const labels = (historyData || []).map(p => p.t);
    const tempData = (historyData || []).map(p => p.temp);
    return {
      labels,
      datasets: [{
        label: 'Temperatura',
        data: tempData,
        borderColor: '#2a7ae2',
        backgroundColor: 'rgba(42, 122, 226, 0.1)',
        borderWidth: 1.5,
        tension: 0.3,
        pointRadius: 0,
        fill: true,
      }],
    };
  }, [historyData]);

  // --- Configurações do gráfico ---
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: {
      x: {
        type: 'time', adapters: { date: { locale: ptBR } },
        time: { unit: 'hour', tooltipFormat: 'dd/MM HH:mm', displayFormats: { hour: 'HH:mm' } },
        ticks: { maxTicksLimit: 5, color: '#999', font: { size: 9 } },
        grid: { display: false },
      },
      y: {
        grid: { color: '#eee' },
        ticks: { color: '#999', font: { size: 9 }, callback: value => `${value}°` },
      },
    },
    interaction: { intersect: false, mode: 'index' },
  }), []);

  const hasEnoughData = historyData && historyData.length >= 2;


  return (
    <div style={cardStyle}>
      <div style={styles.cardHeader}>
        <div>
          <h2 style={styles.cardTitle}>{devMeta.name}</h2>
          {!devMeta.id.startsWith("COLE_O_ID_") && (
            <div style={styles.cardSubTitle}>{devMeta.id}</div>
          )}
        </div>
        <div style={styles.statusIcons}>
           {/* Ícone de Bateria */}
           {typeof bVal === 'number' && !devMeta.id.startsWith("COLE_O_ID_") && (
              <span style={lowBattery ? styles.batteryIconLow : styles.batteryIconOk} title={`Bateria: ${batStr}`}>
                  {bVal > 80 ? '🔋' : bVal > 50 ? '🔋' : bVal > 20 ? '🔋' : '🪫'} {/* Melhores ícones de bateria */}
              </span>
           )}
           {/* Ícone Online/Offline */}
           {!devMeta.id.startsWith("COLE_O_ID_") && (
              <span style={isOffline ? styles.offlineIcon : styles.onlineIcon} title={statusText}>
                  {isOffline ? '○' : '📶'}
              </span>
           )}
        </div>
      </div>

      <div style={styles.mainData}>
        <div style={styles.tempBlock}>
          <div style={styles.tempValue}>{tempStr}<span style={styles.tempUnit}>°C</span></div>
        </div>
        <div style={styles.otherData}>
          <span style={styles.dataPair}>💧 {humStr}%</span>
          {/* Mostra bateria aqui também se não for placeholder */}
          {!devMeta.id.startsWith("COLE_O_ID_") && typeof bVal === 'number' && (
              <span style={styles.dataPair}>
                  {bVal > 80 ? '🔋' : bVal > 50 ? '🔋' : bVal > 20 ? '🔋' : '🪫'} {batStr}
              </span>
          )}
        </div>
      </div>

      {/* Gráfico */}
      <div style={styles.chartContainer}>
          {isLoading || !hasEnoughData || devMeta.id.startsWith("COLE_O_ID_") ? (
              <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40px', fontSize: '0.8rem' }}>
                  {devMeta.id.startsWith("COLE_O_ID_") ? 'Dispositivo não configurado' : (isLoading ? 'Carregando histórico...' : 'Aguardando mais dados para o gráfico...')}
              </div>
          ) : (
              <Line options={chartOptions} data={chartData} />
          )}
      </div>

      {/* Texto de Status no final */}
      <div style={{ ...styles.statusText, ...(isError ? styles.statusTextError : hasAlert ? styles.statusTextWarn : styles.statusTextOk) }}>
          {statusText}
      </div>

    </div>
  );
}

/** ========= PÁGINA PRINCIPAL (Redesenhada) ========= */
export default function TuyaMultiEnvDashboard() {
  const [token, setToken] = useState(null);
  const [refreshSec, setRefreshSec] = useState(DEFAULT_REFRESH_SECONDS);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [items, setItems] = useState(() =>
    DEVICES.map((d) => ({
      id: d.id, name: d.name, status: [], functions: null, online: null,
      loading: true, ok: false, err: "",
      metrics: { tVal: null, hVal: null, bVal: null },
    }))
  );

  const [history, setHistory] = useState({});
  useEffect(() => {
    const initialHistory = {};
    DEVICES.forEach((d) => (initialHistory[d.id] = loadHistory(d.id)));
    setHistory(initialHistory);
  }, []);

  const timerRef = useRef(null);

  function pushHistory(deviceId, { temp, hum, t }) {
    const now = t || Date.now();
    setHistory((prev) => {
      const currentHistory = Array.isArray(prev[deviceId]) ? prev[deviceId] : [];
      // Evita adicionar pontos duplicados (mesmo timestamp)
      if (currentHistory.length > 0 && currentHistory[currentHistory.length - 1].t === now) {
          return prev;
      }
      const list = [...currentHistory, { t: now, temp, hum }];
      const cutoff = now - HISTORY_WINDOW_MS;
      const trimmed = list.filter((p) => p.t >= cutoff).slice(-HISTORY_MAX_POINTS);
      saveHistory(deviceId, trimmed);
      return { ...prev, [deviceId]: trimmed };
    });
  }

  async function ensureToken() {
    if (token) return token;
    console.log("Obtendo novo token...");
    try {
        const t = await getAccessToken();
        setToken(t);
        console.log("Token obtido.");
        return t;
    } catch (e) {
        console.error("Falha ao obter token:", e);
        throw e; // Re-lança o erro para ser pego pelo loadAll
    }
  }

  async function fetchOne(deviceId, currentToken) {
    // status
    let statusResult = await tuyaProxy({ token: currentToken, tuyaPath: `/v1.0/devices/${deviceId}/status` });
    let s = statusResult.data;

    if (s?.code === 1010 || s?.msg === "token invalid") {
      console.log(`Token inválido para ${deviceId}, renovando...`);
      currentToken = await getAccessToken(); // Pega um token totalmente novo
      setToken(currentToken);
      statusResult = await tuyaProxy({ token: currentToken, tuyaPath: `/v1.0/devices/${deviceId}/status` });
      s = statusResult.data;
    }
    if (!s?.success) throw new Error(s?.msg || `Falha status ${deviceId}`);

    // functions e info em paralelo para otimizar
    const [fResult, infoResult] = await Promise.all([
      tuyaProxy({ token: currentToken, tuyaPath: `/v1.0/devices/${deviceId}/functions` }),
      tuyaProxy({ token: currentToken, tuyaPath: `/v1.0/devices/${deviceId}` })
    ]);

    const f = fResult.data;
    const info = infoResult.data;
    if (!f?.success) console.warn(`Falha functions ${deviceId}: ${f?.msg}`);
    if (!info?.success) console.warn(`Falha info ${deviceId}: ${info?.msg}`);

    return {
      status: Array.isArray(s.result) ? s.result : [],
      functions: f?.result || {},
      online: info?.result?.online ?? null,
    };
  }

  // --- loadAll Refatorado ---
  const loadAll = async () => {
    console.log("Iniciando loadAll...");
    setError("");
    setItems(prev => prev.map(item => ({ ...item, loading: true })));

    let currentToken;
    try {
      currentToken = await ensureToken();
    } catch (tokenError) {
      setError(`Falha ao autenticar: ${tokenError.message}`);
      setItems(prev => prev.map(item => ({ ...item, loading: false, ok: false, err: `Falha Auth` })));
      return;
    }

    const results = await Promise.allSettled(
      DEVICES.map(async (d) => {
        if (d.id.startsWith("COLE_O_ID_")) {
          return { id: d.id, name: d.name, ok: false, err: "Não configurado" };
        }
        try {
          // Passa o token mais recente para fetchOne
          const r = await fetchOne(d.id, token || currentToken); // Usa o token do estado se já tiver um
          return { id: d.id, name: d.name, ok: true, ...r };
        } catch (e) {
          return { id: d.id, name: d.name, ok: false, err: e?.message || String(e) };
        }
      })
    );

    const processedResults = results.map(res => res.status === 'fulfilled' ? res.value : res.reason);

    // Calcula métricas e atualiza histórico dentro do setItems para garantir consistência
    setItems(() => {
        const now = Date.now();
        return processedResults.map(res => {
            const functionsArray = res.functions?.functions || [];
            const fnMap = new Map(functionsArray.map((f) => [f.code, f]));
            const tempPref = ["va_temperature", "temp_current", "temperature", "temp_value", "temp_set"];
            const humPref  = ["va_humidity", "humidity_value", "humidity"];
            const batPref  = ["battery_percentage", "battery_value", "battery_state", "battery"];
            const tSel = prefer(tempPref, res.status);
            const hSel = prefer(humPref,  res.status);
            const bSel = prefer(batPref,  res.status);
            const tMeta = tSel ? fnMap.get(tSel.code) : null;
            const hMeta = hSel ? fnMap.get(hSel.code) : null;
            let tVal = tSel ? scaleNormalize(tSel.value, tMeta) : null;
            let hVal = hSel ? scaleNormalize(hSel.value, hMeta) : null;
            let bVal = bSel ? bSel.value : null;

            if (tSel && (tSel.code === 'va_temperature' || tSel.code === 'temp_current') && tVal === tSel.value && typeof tVal === 'number' && Math.abs(tVal) > 100) {
               tVal = tVal / 10.0;
            }
            if (typeof bVal === "string") {
                const map = { low: 20, medium: 50, high: 80, full: 100 };
                bVal = map[bVal.toLowerCase()] ?? bVal;
            }
            if (typeof bVal === "number") bVal = Math.max(0, Math.min(100, bVal));

            // Adiciona ao histórico se os dados são válidos
            if (res.ok && res.online && (typeof tVal === "number" || typeof hVal === "number")) {
              pushHistory(res.id, { t: now, temp: tVal, hum: hVal });
            }

            return {
              ...res, // Inclui id, name, ok, err, status, functions, online
              loading: false,
              metrics: { tVal, hVal, bVal, lowBattery: typeof bVal === "number" && bVal < 20 },
            };
        });
    });

    setLastUpdated(new Date());
    console.log("loadAll concluído.");
  };
  // -------------------------


  useEffect(() => {
    loadAll(); // Carga inicial
    return () => timerRef.current && clearInterval(timerRef.current);
  }, []); // Apenas na montagem

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshSec > 0) {
      timerRef.current = setInterval(loadAll, refreshSec * 1000);
    }
    return () => timerRef.current && clearInterval(timerRef.current);
  }, [refreshSec]); // Reage à mudança do refreshSec


  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Painel de Monitoramento</span>
        <div style={styles.headerControls}>
          <span>
              Última atualização: {lastUpdated ? lastUpdated.toLocaleString('pt-BR', {hour: '2-digit', minute:'2-digit', second:'2-digit'}) : "Carregando..."}
          </span>
          <span>|</span>
          <span>
              Auto-refresh:
              <select
                 value={refreshSec}
                 onChange={(e) => setRefreshSec(Number(e.target.value))}
                 style={styles.selectControl}
                 title="Intervalo de atualização automática"
              >
                <option value={0}>Manual</option>
                <option value={300}>5 min</option>
                <option value={600}>10 min</option>
                <option value={1800}>30 min</option>
              </select>
          </span>
          <button onClick={loadAll} style={styles.buttonControl}>
              Atualizar Agora
          </button>
        </div>
      </div>

      {error && (
        <p style={styles.globalError}>Erro ao carregar dados: {error}</p>
      )}

      <div style={styles.container}>
        {items.map((d) => ( // Renderiza a partir de items
          <DeviceCard
             key={d.id}
             devMeta={d}
             historyData={history[d.id] || []}
          />
        ))}
      </div>
    </div>
  );
}
