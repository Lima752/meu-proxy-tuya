// /pages/index.js
// --- CÓDIGO ATUALIZADO (v8) ---
// Redesenha a UI para se parecer com o Nexxto, adiciona Chart.js

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
  // Adicione mais dispositivos aqui se precisar
];

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
  // Adiciona cabeçalhos CORS na resposta do proxy para o navegador
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tuya-Method, X-Tuya-Path',
  };
  // Se a resposta original tiver um Content-Type, preserva-o
  if (r.headers.has('content-type')) {
    headers['Content-Type'] = r.headers.get('content-type');
  }

  // Retorna os dados E os cabeçalhos (embora o fetch do browser ignore os headers daqui)
  // A correção real do CORS precisa estar nos arquivos /api/*.js
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

/** ========= COMPONENTE DO CARD (Redesenhado) ========= */
function DeviceCard({ devMeta, historyData }) {
  const { tVal, hVal, bVal } = devMeta.metrics; // Removemos alertas por simplicidade no layout

  const isLoading = devMeta.loading;
  const isOffline = devMeta.online === false;
  const isError = !devMeta.ok || isOffline; // Erro = Falha na API OU Offline

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
  // const humStr = isLoading ? "--" : (typeof hVal === "number" ? hVal.toFixed(0) : "--"); // Não exibido
  // const batStr = isLoading ? "--" : (typeof bVal === "number" ? bVal : "--"); // Não exibido

  let cardStyle = {...styles.card};
  if (isOffline) {
    cardStyle = {...cardStyle, ...styles.cardOffline};
  }

  // --- Prepara dados para o gráfico ---
  const chartData = useMemo(() => {
      const labels = (historyData || []).map(p => p.t); // Usa timestamps como labels
      const tempData = (historyData || []).map(p => p.temp);
      // const humData = (historyData || []).map(p => p.hum); // Se quiser adicionar umidade

      return {
          labels: labels,
          datasets: [
              {
                  label: 'Temperatura (°C)',
                  data: tempData,
                  borderColor: '#2a7ae2', // Azul
                  backgroundColor: 'rgba(42, 122, 226, 0.1)',
                  tension: 0.1, // Linha suave
                  pointRadius: 0, // Esconde pontos individuais
                  fill: true, // Preenche a área abaixo da linha
              },
              // { // Se quiser adicionar umidade
              //     label: 'Umidade (%)',
              //     data: humData,
              //     borderColor: '#10b981', // Verde
              //     backgroundColor: 'rgba(16, 185, 129, 0.1)',
              //     tension: 0.1,
              //     pointRadius: 0,
              //     fill: true,
              //     yAxisID: 'y1', // Para usar um eixo Y secundário
              // },
          ],
      };
  }, [historyData]);

  // --- Configurações do gráfico ---
  const chartOptions = useMemo(() => ({
      responsive: true,
      maintainAspectRatio: false, // Permite controlar a altura pelo container
      plugins: {
          legend: { display: false }, // Esconde a legenda
          tooltip: { enabled: true }, // Mostra tooltip ao passar o mouse
      },
      scales: {
          x: {
              type: 'time', // Eixo X é baseado em tempo
              time: {
                  unit: 'hour', // Unidade de exibição
                  tooltipFormat: 'dd/MM HH:mm', // Formato no tooltip
                  displayFormats: {
                      hour: 'HH:mm' // Formato no eixo X
                  }
              },
              ticks: { maxTicksLimit: 6 }, // Limita número de labels no eixo X
              grid: { display: false }, // Esconde grid vertical
          },
          y: { // Eixo Y principal (Temperatura)
              beginAtZero: false,
              grid: { color: '#eee' }, // Grid horizontal suave
              position: 'left',
          },
          // y1: { // Eixo Y secundário (Umidade) - descomentar se usar
          //     beginAtZero: false,
          //     grid: { display: false },
          //     position: 'right',
          //     ticks: { callback: value => `${value}%` }
          // },
      },
      interaction: {
        intersect: false,
        mode: 'index',
      },
  }), []);

  return (
    <div style={cardStyle}>
      <div style={styles.cardHeader}>
          <div>
              <h2 style={styles.cardTitle}>{devMeta.name}</h2>
              <div style={styles.cardSubTitle}>{devMeta.id}</div>
          </div>
          {/* Indicador Online/Offline (parecido com ícone de sinal) */}
          <div style={isOffline ? styles.offlineIndicator : styles.onlineIndicator}>
              {/* Usando um caractere unicode simples para simular sinal */}
              {isOffline ? '○' : '📶'}
          </div>
      </div>

      <div style={styles.tempDisplay}>
        <span style={styles.tempIcon}>🌡️</span> {/* Ícone de termômetro */}
        <span style={styles.tempValue}>{tempStr}</span>
        <span style={styles.tempUnit}>°C</span>
      </div>

      {/* Container do Gráfico */}
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
      loading: true,
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
      const list = [...(prev[deviceId] || []), { t: now, temp, hum }];
      const cutoff = now - HISTORY_WINDOW_MS;
      const trimmed = list.filter((p) => p.t >= cutoff).slice(-HISTORY_MAX_POINTS);
      saveHistory(deviceId, trimmed);
      return { ...prev, [deviceId]: trimmed };
    });
  }

  async function ensureToken() {
    if (token) return token;
    const t = await getAccessToken();
    setToken(t);
    return t;
  }

  async function fetchOne(deviceId, currentToken) {
    // status
    let { data: s } = await tuyaProxy({
      token: currentToken,
      tuyaPath: `/v1.0/devices/${deviceId}/status`,
    });
    // token expirado → renova e re-tenta
    if (s?.code === 1010 || s?.msg === "token invalid") {
      const newTk = await getAccessToken();
      setToken(newTk);
      ({ data: s } = await tuyaProxy({
        token: newTk,
        tuyaPath: `/v1.0/devices/${deviceId}/status`,
      }));
    }
    if (!s?.success) throw new Error(s?.msg || `Falha status ${deviceId}`);

    // functions (necessário para escala)
    const { data: f } = await tuyaProxy({
      token: token || (await ensureToken()),
      tuyaPath: `/v1.0/devices/${deviceId}/functions`,
    });
    if (!f?.success) console.warn(`Falha functions ${deviceId}: ${f?.msg}`); // Não crítico

    // info (online/offline)
    const { data: info } = await tuyaProxy({
      token: token || (await ensureToken()),
      tuyaPath: `/v1.0/devices/${deviceId}`,
    });
     if (!info?.success) console.warn(`Falha info ${deviceId}: ${info?.msg}`); // Não crítico

    return {
      status: Array.isArray(s.result) ? s.result : [],
      functions: f?.result || {},
      online: info?.result?.online ?? null,
    };
  }

  async function loadAll() {
    setError(""); // Limpa erro global antes de tentar
    setItems(prev => prev.map(item => ({...item, loading: true}))); // Define loading para todos

    try {
      const tk = await ensureToken();
      const results = await Promise.all(
        DEVICES.map(async (d) => {
          if (d.id.startsWith("COLE_O_ID_")) {
            return { id: d.id, ok: false, err: "ID não configurado", name: d.name };
          }
          try {
            const r = await fetchOne(d.id, tk);
            return { id: d.id, ok: true, name: d.name, ...r };
          } catch (e) {
            console.error(`Erro ao buscar ${d.name}:`, e); // Loga erro específico
            return { id: d.id, ok: false, err: e?.message || String(e), name: d.name };
          }
        })
      );

      setItems((prev) =>
        prev.map((p) => {
          const found = results.find((r) => r.id === p.id);
          if (!found) return { ...p, name: p.name || `Device ${p.id}` };
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

      const now = Date.now();
      results.forEach((res) => {
          if (!res?.ok || res?.online === false) return;

          const fnMap = new Map((res.functions?.functions || []).map((f) => [f.code, f]));
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
            // Apenas adiciona ao histórico se os valores forem válidos
            pushHistory(res.id, { t: now, temp: typeof tVal === "number" ? tVal : null, hum: typeof hVal === "number" ? hVal : null });
          }
      });

      setLastUpdated(new Date());
    } catch (e) {
      console.error("Erro global ao carregar dados:", e); // Loga erro global
      setError(String(e));
       setItems(prev => prev.map(item => ({...item, loading: false, ok: false, err: String(e) }))); // Garante que loading termine em erro global
    }
  }

  useEffect(() => {
    loadAll(); // Carga inicial
    return () => timerRef.current && clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshSec > 0) {
        timerRef.current = setInterval(loadAll, refreshSec * 1000);
        console.log(`Auto-refresh definido para ${refreshSec} segundos.`);
    } else {
        console.log("Auto-refresh desativado.");
    }
    return () => timerRef.current && clearInterval(timerRef.current);
  }, [refreshSec]); // Depende apenas de refreshSec

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

      return { ...devMeta, metrics: { tVal, hVal, bVal, tempAlert, humAlert, lowBattery } };
    });
  }, [items]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Painel de Monitoramento</span>
        <div style={{ fontSize: 12 }}>
          Atualização:
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
          <button onClick={loadAll} style={{ marginLeft: 10, padding: "4px 8px", fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 4 }}>
              Atualizar
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
             historyData={history[d.id] || []} // Passa o histórico para o card
          />
        ))}
      </div>
    </div>
  );
}
