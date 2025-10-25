// /pages/index.js
// --- CÓDIGO REVISADO (v9) ---
// Verificando a sintaxe da lista DEVICES

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
} from 'chart.js';
import 'chartjs-adapter-date-fns'; // Importa o adaptador de data

// Registra os componentes do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale // Registra TimeScale
);

/** ========= CONFIG ========= */
const DEVICES = [
  { id: "eb798cab6fd0612ab95jwc", name: "Sala-T5" },
  { id: "eb4834395c8fbc4dfefpe9", name: "Sala-T4" },
  { id: "eb13a02df36c15cc0czqmm", name: "Sala-T3" },
  { id: "eb08f82b6ddb5a1699dced", name: "Sala-T2" },
  // Os placeholders foram removidos para evitar erros se os IDs não forem preenchidos
  // { id: "COLE_O_ID_5_AQUI", name: "Sensor 5" },
]; // <-- Certifique-se de que esta linha termina com ponto e vírgula

const DEFAULT_REFRESH_SECONDS = 300; // 5 minutos
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const HISTORY_MAX_POINTS = 288; // (24h * 60min / 5min por ponto)

/** ========= HELPERS (LÓGICA - NÃO MEXER) ========= */
function parseFunctionValues(valuesStr) {
  try { return JSON.parse(valuesStr || "{}"); } catch { return {}; }
}
function scaleNormalize(value, meta) {
  if (!meta) return value;
  if (meta?.type === "Integer") {
    let conf = {};
    if (typeof meta.values === 'string') {
        try { conf = JSON.parse(meta.values || "{}"); } catch { conf = {}; }
    } else if (typeof meta.values === 'object' && meta.values !== null) {
        conf = meta.values;
    }
    const scale = Number(conf.scale || 0);
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
  const j = await r.json();
  return { status: r.status, data: j };
}
function prefer(keys, statusArr) {
  const map = new Map((statusArr || []).map((s) => [s.code, s.value]));
  for (const k of keys) if (map.has(k)) return { code: k, value: map.get(k) };
  const list = (statusArr || []).map((s) => s.code.toLowerCase());
  for (const k of keys) {
    const hit = list.find((x) => x.includes(k.replace(/_/g, "")));
    if (hit) {
      const found = (statusArr || []).find((s) => s.code.toLowerCase() === hit);
      if (found) return { code: found.code, value: found.value };
    }
  }
  return null;
}
function loadHistory(deviceId) {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(`history:${deviceId}`) || "[]"); }
  catch { return []; }
}
function saveHistory(deviceId, arr) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`history:${deviceId}`, JSON.stringify(arr)); } catch {}
}

/** ========= ESTILOS (Inspirado no Nexxto) ========= */
const styles = {
  page: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    backgroundColor: "#f0f2f5", // Fundo cinza claro
    margin: 0,
    padding: "10px", // Menos padding
    minHeight: "100vh",
  },
  header: {
    backgroundColor: "#2a7ae2", // Azul Nexxto (aproximado)
    color: "white",
    padding: "10px 15px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "15px",
    borderRadius: "8px",
  },
  headerTitle: {
      fontSize: "1.2rem",
      fontWeight: 600,
  },
  container: {
    display: "grid", // Usar grid para melhor controle
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", // Responsivo
    gap: "15px",
    maxWidth: 1600, // Aumentar largura máxima
    margin: "0 auto",
  },
  card: {
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
    padding: "15px",
    display: "flex",
    flexDirection: "column",
    transition: "opacity 0.2s",
    opacity: 1,
  },
  cardOffline: {
    opacity: 0.6,
  },
  cardHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '10px',
  },
  cardTitle: {
    color: "#333",
    fontSize: "1.1rem",
    fontWeight: 600,
    margin: 0,
  },
  cardSubTitle: {
      fontSize: '0.8rem',
      color: '#777',
      marginTop: '2px',
  },
  onlineIndicator: {
      fontSize: '1.5rem', // Tamanho do ícone
      color: '#4CAF50', // Verde para online
  },
  offlineIndicator: {
      fontSize: '1.5rem',
      color: '#aaa', // Cinza para offline
  },
  tempDisplay: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center', // Centraliza temperatura
    gap: '10px',
    margin: "15px 0",
    color: "#1c1e21", // Cor escura para temp
  },
  tempIcon: {
      fontSize: '2.5rem', // Ícone maior
      color: '#2a7ae2', // Azul
  },
  tempValue: {
    fontSize: "3rem", // Temperatura bem grande
    fontWeight: 700,
  },
  tempUnit: {
    fontSize: "1.5rem",
    color: "#555",
    alignSelf: 'flex-start', // Alinha °C no topo
    marginTop: '0.5rem',
  },
  chartContainer: {
    marginTop: "15px",
    height: "150px", // Altura fixa para o gráfico
    position: 'relative', // Necessário para Chart.js responsivo
  },
  statusBanner: {
    marginTop: "auto", // Empurra para baixo
    padding: "8px",
    borderRadius: "5px",
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
    fontSize: "0.9rem",
  },
  statusLoading: { background: "#ff9800" },
  statusOk: { background: "#4CAF50" },
  statusError: { background: "#f44336" },
  globalError: {
    color: "#f44336",
    fontWeight: "bold",
    marginTop: 20,
    padding: "10px",
    background: "#FFEBEE",
    border: "1px solid #FFCDD2",
    borderRadius: "8px",
    textAlign: "center",
    width: "calc(100% - 40px)",
    margin: "0 auto 20px auto",
  },
};

/** ========= COMPONENTE DE GRÁFICO (ADICIONADO) ========= */
function Sparkline({ values = [], stroke = "#0ea5e9", width = 220, height = 48 }) {
  const W = width, H = height, P = 6;
  if (!values.length || values.length < 2) return (
    <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 14, background: '#fafafa', borderRadius: 8 }}>
      Sem dados de histórico suficientes
    </div>
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rng = max - min || 1;
  const step = (W - P * 2) / Math.max(1, values.length - 1);
  const points = values.map((v, i) => {
    const x = P + i * step;
    const y = P + (H - P * 2) * (1 - (v - min) / rng);
    return `${x},${y}`;
  });
  return (
    <svg width={W} height={H} style={{ display: "block", margin: '0 auto' }}>
      <polyline fill="none" stroke={stroke} strokeWidth={2} points={points.join(" ")} />
    </svg>
  );
}

/** ========= COMPONENTE DO CARD (Redesenhado) ========= */
function DeviceCard({ devMeta, historyData }) {
  // Pega métricas calculadas. Se não houver, usa valores padrão
  const metrics = devMeta.metrics || { tVal: null, hVal: null, bVal: null };
  const { tVal, hVal, bVal } = metrics;

  const isLoading = devMeta.loading;
  const isOffline = devMeta.online === false;
  // Considera erro apenas se não estiver carregando E (falhou API OU está offline)
  const isError = !isLoading && (!devMeta.ok || isOffline);

  let statusText = "A carregar...";
  let statusStyle = {...styles.statusBanner, ...styles.statusLoading};

  if (!isLoading) {
    if (isError) {
      statusText = isOffline ? "Status: Offline" : `Erro: ${devMeta.err || 'Desconhecido'}`;
      statusStyle = {...styles.statusBanner, ...styles.statusError};
    } else {
      statusText = "Status: OK";
      statusStyle = {...styles.statusBanner, ...styles.statusOk};
    }
  }

  const tempStr = isLoading ? "--" : (typeof tVal === "number" ? tVal.toFixed(1) : "--");

  let cardStyle = {...styles.card};
  if (isOffline && !isLoading) { // Aplica opacidade apenas se offline E não estiver carregando
    cardStyle = {...cardStyle, ...styles.cardOffline};
  }

  // --- Prepara dados para o gráfico ---
  const chartData = useMemo(() => {
      const labels = (historyData || []).map(p => p.t);
      const tempData = (historyData || []).map(p => p.temp);
      return {
          labels: labels,
          datasets: [
              {
                  label: 'Temperatura (°C)',
                  data: tempData,
                  borderColor: '#2a7ae2',
                  backgroundColor: 'rgba(42, 122, 226, 0.1)',
                  tension: 0.1,
                  pointRadius: 0,
                  fill: true,
              },
          ],
      };
  }, [historyData]);

  // --- Configurações do gráfico ---
  const chartOptions = useMemo(() => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
      scales: {
          x: {
              type: 'time',
              time: { unit: 'hour', tooltipFormat: 'dd/MM HH:mm', displayFormats: { hour: 'HH:mm' } },
              ticks: { maxTicksLimit: 6 },
              grid: { display: false },
          },
          y: { beginAtZero: false, grid: { color: '#eee' }, position: 'left' },
      },
      interaction: { intersect: false, mode: 'index' },
  }), []);

  return (
    <div style={cardStyle}>
      <div style={styles.cardHeader}>
          <div>
              <h2 style={styles.cardTitle}>{devMeta.name}</h2>
              <div style={styles.cardSubTitle}>{devMeta.id}</div>
          </div>
          <div style={isOffline ? styles.offlineIndicator : styles.onlineIndicator}>
              {isOffline ? '○' : '📶'}
          </div>
      </div>

      <div style={styles.tempDisplay}>
        <span style={styles.tempIcon}>🌡️</span>
        <span style={styles.tempValue}>{tempStr}</span>
        <span style={styles.tempUnit}>°C</span>
      </div>

      <div style={styles.chartContainer}>
        {isLoading || !historyData || historyData.length < 2 ? (
            <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '50px' }}>
                {isLoading ? 'Carregando histórico...' : 'Aguardando dados de histórico...'}
            </div>
        ) : (
            <Line options={chartOptions} data={chartData} />
        )}
      </div>

      <div style={statusStyle}>{statusText}</div>
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
      id: d.id,
      name: d.name,
      status: [],
      functions: null,
      online: null,
      loading: true, // Começa carregando
      ok: false,
      err: "",
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
      // Garante que prev[deviceId] seja um array
      const currentHistory = Array.isArray(prev[deviceId]) ? prev[deviceId] : [];
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
    const t = await getAccessToken();
    setToken(t);
    console.log("Token obtido.");
    return t;
  }

  async function fetchOne(deviceId, currentToken) {
    // status
    console.log(`Buscando status para ${deviceId}...`);
    let statusResult = await tuyaProxy({
      token: currentToken,
      tuyaPath: `/v1.0/devices/${deviceId}/status`,
    });
    let s = statusResult.data;

    // token expirado → renova e re-tenta
    if (s?.code === 1010 || s?.msg === "token invalid") {
      console.log(`Token inválido para ${deviceId}, renovando...`);
      const newTk = await getAccessToken(); // Pega um token totalmente novo
      setToken(newTk); // Atualiza o token no estado global
      currentToken = newTk; // Usa o novo token para a retentativa
      console.log(`Retentando status para ${deviceId} com novo token...`);
      statusResult = await tuyaProxy({ // Refaz a chamada de status
        token: currentToken,
        tuyaPath: `/v1.0/devices/${deviceId}/status`,
      });
      s = statusResult.data;
    }
    if (!s?.success) {
        console.error(`Falha ao obter status para ${deviceId}: ${s?.msg}`);
        throw new Error(s?.msg || `Falha status ${deviceId}`);
    }
    console.log(`Status OK para ${deviceId}.`);

    // functions (necessário para escala)
    console.log(`Buscando functions para ${deviceId}...`);
    const { data: f } = await tuyaProxy({
      token: currentToken, // Usa o token atual (pode ter sido renovado)
      tuyaPath: `/v1.0/devices/${deviceId}/functions`,
    });
    if (!f?.success) console.warn(`Falha functions ${deviceId}: ${f?.msg}`);
    else console.log(`Functions OK para ${deviceId}.`);


    // info (online/offline)
    console.log(`Buscando info para ${deviceId}...`);
    const { data: info } = await tuyaProxy({
      token: currentToken, // Usa o token atual
      tuyaPath: `/v1.0/devices/${deviceId}`,
    });
     if (!info?.success) console.warn(`Falha info ${deviceId}: ${info?.msg}`);
     else console.log(`Info OK para ${deviceId} (Online: ${info?.result?.online}).`);

    return {
      status: Array.isArray(s.result) ? s.result : [],
      functions: f?.result || {},
      online: info?.result?.online ?? null,
    };
  }

  async function loadAll() {
    console.log("Iniciando loadAll...");
    setError("");
    // Define loading=true para todos os items visíveis ANTES de começar a buscar
    setItems(prev => prev.map(item => ({...item, loading: true})));

    let currentToken;
    try {
        currentToken = await ensureToken();
    } catch (tokenError) {
        console.error("Erro CRÍTICO ao obter token inicial:", tokenError);
        setError(`Falha ao autenticar: ${tokenError.message}`);
        setItems(prev => prev.map(item => ({...item, loading: false, ok: false, err: `Falha ao autenticar: ${tokenError.message}`})));
        return; // Aborta se não conseguir o token inicial
    }


    console.log("Buscando dados para todos os dispositivos...");
    const results = await Promise.allSettled( // Usa Promise.allSettled para não parar em um erro
      DEVICES.map(async (d) => {
        if (d.id.startsWith("COLE_O_ID_")) {
          // Retorna um objeto que se parece com um resultado de falha
          return { status: 'fulfilled', value: { id: d.id, ok: false, err: "ID não configurado", name: d.name } };
        }
        try {
          // Passa o token atual para fetchOne
          const r = await fetchOne(d.id, currentToken);
          // Retorna um objeto que se parece com um resultado de sucesso
          return { status: 'fulfilled', value: { id: d.id, ok: true, name: d.name, ...r } };
        } catch (e) {
          console.error(`Erro final ao buscar ${d.name}:`, e);
          // Retorna um objeto que se parece com um resultado de falha
          return { status: 'rejected', reason: { id: d.id, ok: false, err: e?.message || String(e), name: d.name } };
        }
      })
    );
    console.log("Busca concluída.");


    // Processa os resultados (sucessos e falhas)
    const processedResults = results.map(res => {
        if (res.status === 'fulfilled') {
            return res.value; // Resultado bem-sucedido ou placeholder
        } else {
            // Resultado de falha da Promise (erro na chamada fetchOne)
            // res.reason contém { id, ok, err, name }
            return res.reason;
        }
    });

    // Atualiza o estado dos items
    setItems((prev) =>
      prev.map((p) => {
        const found = processedResults.find((r) => r.id === p.id);
        if (!found) return { ...p, name: p.name || `Device ${p.id}`, loading: false }; // Garante que loading termine
        return {
          ...p,
          name: found.name || `Device ${p.id}`,
          status: found.status || [],
          functions: found.functions || null,
          online: found.online,
          loading: false, // Loading termina aqui
          ok: !!found.ok,
          err: found.err || "",
        };
      })
    );

    // Atualiza o histórico apenas para os que tiveram sucesso
    const now = Date.now();
    processedResults.forEach((res) => {
        if (!res?.ok || res?.online === false) return; // Pula falhas e offline

        const functionsArray = res.functions?.functions || [];
        const fnMap = new Map(functionsArray.map((f) => [f.code, f]));
        const tempPref = ["va_temperature", "temp_current", "temperature", "temp_value", "temp_set"];
        const humPref  = ["va_humidity", "humidity_value", "humidity"];

        const tSel = prefer(tempPref, res.status);
        const hSel = prefer(humPref,  res.status);

        const tMeta = tSel ? fnMap.get(tSel.code) : null;
        const hMeta = hSel ? fnMap.get(hSel.code) : null;

        let tVal = tSel ? scaleNormalize(tSel.value, tMeta) : null;
        let hVal = hSel ? scaleNormalize(hSel.value, hMeta) : null;

        if (tSel && (tSel.code === 'va_temperature' || tSel.code === 'temp_current') && tVal === tSel.value && typeof tVal === 'number' && Math.abs(tVal) > 100) {
           tVal = tVal / 10.0;
        }

        if (typeof tVal === "number" || typeof hVal === "number") {
          pushHistory(res.id, { t: now, temp: typeof tVal === "number" ? tVal : null, hum: typeof hVal === "number" ? hVal : null });
        }
    });

    setLastUpdated(new Date());
    console.log("loadAll concluído.");
  }


  useEffect(() => {
    loadAll(); // Carga inicial
    return () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            console.log("Timer de refresh limpo.");
        }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Roda apenas uma vez ao montar

  useEffect(() => {
    if (timerRef.current) {
        clearInterval(timerRef.current);
        console.log("Timer anterior limpo.");
    }
    if (refreshSec > 0) {
        timerRef.current = setInterval(loadAll, refreshSec * 1000);
        console.log(`Auto-refresh definido para ${refreshSec} segundos.`);
    } else {
        console.log("Auto-refresh desativado.");
    }
    // Função de limpeza para quando o componente desmontar OU refreshSec mudar
    return () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            console.log("Timer de refresh limpo ao desmontar ou mudar refreshSec.");
        }
    };
  }, [refreshSec]); // Roda sempre que refreshSec mudar

  // Pré-calcula métricas para todos os itens
  const itemsWithMetrics = useMemo(() => {
    return items.map(devMeta => {
      const functionsArray = devMeta.functions?.functions || [];
      const fnMap = new Map(functionsArray.map((f) => [f.code, f]));

      const tempPref = ["va_temperature", "temp_current", "temperature", "temp_value", "temp_set"];
      const humPref  = ["va_humidity", "humidity_value", "humidity"];
      const batPref  = ["battery_percentage", "battery_value", "battery_state", "battery"];

      const tSel = prefer(tempPref, devMeta.status);
      const hSel = prefer(humPref,  devMeta.status);
      const bSel = prefer(batPref,  devMeta.status);

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

      const tempAlert  = false;
      const humAlert   = false;
      const lowBattery = typeof bVal === "number" && bVal < 20;

      // Adiciona o nome ao objeto retornado
      return { ...devMeta, name: devMeta.name || `Device ${devMeta.id}`, metrics: { tVal, hVal, bVal, tempAlert, humAlert, lowBattery } };
    });
  }, [items]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Painel de Monitoramento</span>
        <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>
              Última atualização: {lastUpdated ? lastUpdated.toLocaleString() : "Carregando..."}
          </span>
          <span>|</span>
          <span>
              Auto-refresh:
              <select
                 value={refreshSec}
                 onChange={(e) => setRefreshSec(Number(e.target.value))}
                 style={{ marginLeft: 5, fontSize: 12, border: 'none', background: 'transparent', color: 'white', cursor: 'pointer' }}
                 title="Intervalo de atualização automática"
              >
                <option value={0} style={{color: 'black'}}>Manual</option>
                <option value={300} style={{color: 'black'}}>5 min</option>
                <option value={600} style={{color: 'black'}}>10 min</option>
                <option value={1800} style={{color: 'black'}}>30 min</option>
              </select>
          </span>
          <button onClick={loadAll} style={{ padding: "4px 8px", fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 4 }}>
              Atualizar Agora
          </button>
        </div>
      </div>

      {error && (
        <p style={styles.globalError}>Erro ao carregar dados: {error}</p>
      )}

      <div style={styles.container}>
        {itemsWithMetrics.map((d) => (
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
