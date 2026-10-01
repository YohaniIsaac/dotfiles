import { createComputed, createState, type Accessor } from "ags"
import { execAsync } from "ags/process"
import GLib    from "gi://GLib"
import Gio     from "gi://Gio"
import GObject from "gi://GObject"
import NM      from "gi://NM"
import Network from "gi://AstalNetwork"

// ── Red (NetworkManager vía libnm) — estado compartido por la barra y el popup de red ─────────
// Se usa el NM.Client de AstalNetwork (un solo cliente D-Bus para toda la barra), pero NO sus
// envoltorios Wifi / Wired / AccessPoint: tienen trampas verificadas el 2026-09-30 (r908):
//  · la PROPIEDAD access_points no se puede leer desde JS ("Can't convert non-null pointer");
//    el método get_access_points() sí. createBinding(wifi, "accessPoints") fallaría.
//  · `wifi` y `wired` se eligen una sola vez al construir y no se actualizan; `wired` es solo el
//    primero de los puertos Ethernet (aquí hay dos, de un dock USB).
//  · Wired.internet vale "conectado" por defecto, aunque el cable esté desenchufado.
//  · AccessPoint.activate() crea SIEMPRE un perfil wpa-psk fijado al BSSID de ese AP: falla en
//    redes abiertas, WPA3 (SAE) y 802.1X, y deja el perfil atado a un solo AP (leído del fuente).
//  · Wifi.scanning queda en true si el escaneo falla, y Wifi.ssid no se limpia al desconectar
//    (leído del fuente).
// libnm sí entrega todas sus señales (comprobado con un escaneo real: access-point-added y
// last-scan llegan), así que aquí no hay sondeo ni subprocesos (salvo abrir nm-connection-editor).

Gio._promisify(NM.Client.prototype,          "activate_connection_async",         "activate_connection_finish")
Gio._promisify(NM.Client.prototype,          "add_and_activate_connection_async", "add_and_activate_connection_finish")
Gio._promisify(NM.Client.prototype,          "deactivate_connection_async",       "deactivate_connection_finish")
Gio._promisify(NM.DeviceWifi.prototype,      "request_scan_async",                "request_scan_finish")
Gio._promisify(NM.RemoteConnection.prototype, "commit_changes_async",             "commit_changes_finish")
Gio._promisify(NM.RemoteConnection.prototype, "delete_async",                     "delete_finish")

const network = Network.get_default()
const client: NM.Client | null = network.client ?? null   // null si NetworkManager no estaba al arrancar

const DS = NM.DeviceState
const DR = NM.DeviceStateReason

// ── Seguridad de un punto de acceso ───────────────────────────────────────────────────────────
// Banderas de NM (NM_802_11_AP_SEC_KEY_MGMT_*, valores leídos de libnm 1.58 en ejecución). Se
// definen aquí porque el enum de GJS se llama `80211ApSecurityFlags` (empieza con un dígito).

const KM_PSK = 0x100, KM_EAP = 0x200, KM_SAE = 0x400, KM_OWE = 0x800, KM_OWE_TM = 0x1000, KM_SUITE_B = 0x2000
const KM_ALL = KM_PSK | KM_EAP | KM_SAE | KM_OWE | KM_OWE_TM | KM_SUITE_B
const AP_PRIVACY = 0x1

// Modo del AP (NM.80211Mode). Solo se listan los de infraestructura: un escaneo también trae nodos mesh
// (802.11s, modo 4) y redes ad-hoc. Verificado el 2026-09-30: aquí aparecía como «red WPA3» un nodo mesh
// (SAE, mode=4) que no es un punto de acceso, y un perfil de infraestructura no le corresponde ("connection
// does not match access point").
const AP_MODE_INFRA = 2

export type Security = "open" | "psk" | "sae" | "owe" | "eap" | "wep" | "unsupported"

// psk incluye las redes mixtas WPA2/WPA3 (se conectan con wpa-psk); sae son las solo-WPA3. owe
// es "Enhanced Open" (cifrado sin contraseña); OWE en modo transición se trata como abierta.
export function securityOf(flags: number, wpaFlags: number, rsnFlags: number): Security {
  const all = wpaFlags | rsnFlags
  const km  = all & KM_ALL
  if (km & (KM_EAP | KM_SUITE_B)) return "eap"
  if (km & KM_PSK) return "psk"
  if (km & KM_SAE) return "sae"
  if (km & KM_OWE) return "owe"
  if (all !== 0 && km === 0) return "unsupported"
  if (all === 0 && (flags & AP_PRIVACY)) return "wep"
  return "open"
}

export const needsPassword = (s: Security) => s === "psk" || s === "sae"

// ── Perfil de conexión ────────────────────────────────────────────────────────────────────────
// Sin BSSID (se conecta al mejor AP de la red, y NM puede cambiar de uno a otro) y con la clave
// dentro del perfil del sistema (psk-flags 0, como el perfil que ya existe de la red del trabajo):
// no hace falta un agente de secretos. Solo para redes abiertas, WPA2/WPA3-personal y OWE.

export function buildConnection(
  ssid: GLib.Bytes, name: string, security: "open" | "psk" | "sae" | "owe", password: string | null,
): NM.SimpleConnection {
  const conn = NM.SimpleConnection.new()
  conn.add_setting(new NM.SettingConnection({
    id: name,
    uuid: NM.utils_uuid_generate(),
    type: NM.SETTING_WIRELESS_SETTING_NAME,
    autoconnect: true,
  }))
  conn.add_setting(new NM.SettingWireless({ ssid, mode: NM.SETTING_WIRELESS_MODE_INFRA }))
  if (security !== "open") {
    const sec = new NM.SettingWirelessSecurity({ key_mgmt: security === "psk" ? "wpa-psk" : security })
    if (password) sec.psk = password
    conn.add_setting(sec)
  }
  return conn
}

// ── Tipos públicos ────────────────────────────────────────────────────────────────────────────

export type WifiNet = {
  ssid: string          // SSID como texto: identifica la fila
  strength: number      // 0–100, el del AP más fuerte de esa red
  security: Security
  saved: boolean        // hay un perfil guardado válido para alguno de sus AP
  active: boolean       // el dispositivo está conectado a esta red
  ap: NM.AccessPoint    // el AP más fuerte (de él salen el SSID en bytes y las banderas)
  path: string          // ruta D-Bus del AP con el que se activa (specific_object)
}

export type Attempt =
  | { ssid: string; phase: "connecting" }
  | { ssid: string; phase: "failed"; message: string; retryWithPassword: boolean }

export type EthStatus = "connected" | "connecting" | "disconnected" | "nocable"
export type EthView   = { present: boolean; status: EthStatus; iface: string; speed: number }

// ── Glifos (Nerd Font / Material Design) ──────────────────────────────────────────────────────

const G = {
  wifiOpen:  ["\u{F091F}", "\u{F0922}", "\u{F0925}", "\u{F0928}"],   // 󰤟 󰤢 󰤥 󰤨  1–4 barras
  wifiLock:  ["\u{F0921}", "\u{F0924}", "\u{F0927}", "\u{F092A}"],   // 󰤡 󰤤 󰤧 󰤪  con candado
  wifiAlert: "\u{F0929}",   // 󰤩  conectado pero sin internet
  wifiIdle:  "\u{F092F}",   // 󰤯  encendido, sin conexión
  wifiOff:   "\u{F092D}",   // 󰤭  apagado
  eth:       "\u{F0200}",   // 󰈀
  ethOff:    "\u{F0202}",   // 󰈂
}

// 4 niveles: ≥75 %, ≥50 %, ≥25 % y el resto.
export const barsOf = (strength: number): 0 | 1 | 2 | 3 =>
  strength >= 75 ? 3 : strength >= 50 ? 2 : strength >= 25 ? 1 : 0

export const wifiGlyph = (strength: number, locked: boolean): string =>
  (locked ? G.wifiLock : G.wifiOpen)[barsOf(strength)]

export const ethGlyph = (status: EthStatus): string =>
  status === "connected" || status === "connecting" ? G.eth : G.ethOff

export type NetIconInput = {
  primary: string       // tipo de la conexión primaria de NM: "802-3-ethernet", "802-11-wireless"…
  hasWifi: boolean
  enabled: boolean
  devState: number      // NM.DeviceState del Wi-Fi
  strength: number      // del AP activo
  connectivity: number  // NM.ConnectivityState
}

// Icono del módulo de la barra. Cable si la conexión primaria es Ethernet; si no, según el Wi-Fi:
// apagado (tachado) · encendido sin conexión (vacío) · conectado (barras) · conectado sin internet (alerta).
export function netGlyph(s: NetIconInput): string {
  if (s.primary === "802-3-ethernet") return G.eth
  if (!s.hasWifi) return G.ethOff
  if (!s.enabled) return G.wifiOff
  if (s.devState === DS.ACTIVATED) {
    const online = s.connectivity === NM.ConnectivityState.UNKNOWN || s.connectivity === NM.ConnectivityState.FULL
    return online ? G.wifiOpen[barsOf(s.strength)] : G.wifiAlert
  }
  return G.wifiIdle
}

// ── Ethernet ──────────────────────────────────────────────────────────────────────────────────
// Se resume en una sola fila aunque haya varios puertos (un dock USB trae dos): gana el que esté
// más avanzado (conectado > conectando > con cable pero sin conexión > sin cable).

export type EthDevice = { iface: string; state: number; carrier: boolean; speed: number; managed: boolean }

export function summarizeEthernet(devs: EthDevice[]): EthView {
  const list = devs.filter(d => d.managed && d.state !== DS.UNMANAGED)
  if (list.length === 0) return { present: false, status: "nocable", iface: "", speed: 0 }
  const rank = (d: EthDevice) =>
    d.state === DS.ACTIVATED ? 3
    : d.state > DS.DISCONNECTED && d.state < DS.ACTIVATED ? 2
    : d.carrier ? 1 : 0
  const best = list.reduce((a, b) => rank(b) > rank(a) ? b : a)
  const status: EthStatus = (["nocable", "disconnected", "connecting", "connected"] as const)[rank(best)]
  return { present: true, status, iface: best.iface, speed: status === "connected" ? best.speed : 0 }
}

export const formatSpeed = (mbps: number): string =>
  mbps <= 0 ? "" : mbps >= 1000 ? `${Math.round(mbps / 100) / 10} Gb/s` : `${mbps} Mb/s`

// ── Intento de conexión ───────────────────────────────────────────────────────────────────────
// activate_connection / add_and_activate_connection solo confirman que NM aceptó la orden; el
// resultado real llega como cambios de estado del dispositivo. stepAttempt es esa máquina de
// estados, pura para poder probarla: "conectó" = ACTIVATED en la red pedida; "falló" = FAILED, o
// DISCONNECTED después de haber avanzado (PREPARE…SECONDARIES). Al cambiar de una red a otra el
// dispositivo pasa por DEACTIVATING → DISCONNECTED antes de avanzar: eso no es un fallo.

export function failureText(reason: number): string {
  switch (reason) {
    case DR.NO_SECRETS:            return "Contraseña incorrecta"
    case DR.SSID_NOT_FOUND:        return "Red no encontrada"
    case DR.IP_CONFIG_UNAVAILABLE:
    case DR.DHCP_START_FAILED:
    case DR.DHCP_ERROR:            return "No se obtuvo dirección IP"
    case DR.SUPPLICANT_TIMEOUT:    return "La red no respondió"
    default:                       return "No se pudo conectar"
  }
}

export function stepAttempt(
  at: Attempt | null, sawProgress: boolean,
  ev: { state: number; reason: number }, activeSsid: string | null, canRetryWithPassword: boolean,
): { attempt: Attempt | null; sawProgress: boolean } {
  if (!at || at.phase !== "connecting") return { attempt: at, sawProgress }
  const { state, reason } = ev
  if (state >= DS.PREPARE && state <= DS.SECONDARIES) sawProgress = true
  if (state === DS.ACTIVATED && activeSsid === at.ssid) return { attempt: null, sawProgress: false }
  const superseded = state === DS.DISCONNECTED && reason === DR.NEW_ACTIVATION
  if (state === DS.FAILED || (state === DS.DISCONNECTED && sawProgress && !superseded)) {
    return {
      attempt: { ssid: at.ssid, phase: "failed", message: failureText(reason),
                 retryWithPassword: canRetryWithPassword && reason === DR.NO_SECRETS },
      sawProgress: false,
    }
  }
  return { attempt: at, sawProgress }
}

// ── Estado reactivo ───────────────────────────────────────────────────────────────────────────
// createState y no createExternal: los manejadores de señales de NM viven siempre (la barra
// necesita el icono aunque el popup esté cerrado) y createExternal solo produce con suscriptores.

const [hasWifi,      setHasWifi]      = createState(false)
const [wifiEnabled,  setWifiEnabledSt] = createState(false)
const [wifiHw,       setWifiHw]       = createState(true)    // interruptor de hardware / modo avión
const [devState,      setDevState]    = createState<number>(DS.UNAVAILABLE)
const [activeAp,     setActiveAp]     = createState<{ ssid: string; strength: number } | null>(null)
const [connectivity, setConnectivity] = createState<number>(0)
const [primary,       setPrimary]     = createState("")
const [eth,           setEth]         = createState<EthView>({ present: false, status: "nocable", iface: "", speed: 0 })
const [scanning,     setScanning]     = createState(false)
const [nets,          setNets]        = createState<Map<string, WifiNet>>(new Map())
const [order,         setOrder]       = createState<string[]>([])
const [attempt,      setAttempt]      = createState<Attempt | null>(null)
const [passwordFor,  setPasswordFor]  = createState<string | null>(null)   // red cuyo campo de contraseña está abierto

export const netIcon: Accessor<string> = createComputed(() => netGlyph({
  primary:      primary(),
  hasWifi:      hasWifi(),
  enabled:      wifiEnabled(),
  devState:     devState(),
  strength:     activeAp()?.strength ?? 0,
  connectivity: connectivity(),
}))

// ── Sincronización ────────────────────────────────────────────────────────────────────────────
// Cada señal de NM solo pide una sincronización (con un pequeño retraso que agrupa las ráfagas: un
// escaneo entrega una docena de access-point-added a la vez). La lista de redes solo se recalcula
// mientras el popup está abierto.

const SYNC_DELAY_MS   = 80
const SCAN_COOLDOWN_MS = 10_000   // NM rechaza escaneos pegados a otro
const SCAN_SAFETY_MS   = 12_000   // si last-scan nunca cambia, se da el escaneo por terminado
const ATTEMPT_TIMEOUT_S = 45

let wifiDev: NM.DeviceWifi | null = null
let devHandlers: number[] = []
let listActive = false        // el popup está abierto
let sortDirty  = true         // hay que reordenar la lista en la próxima sincronización
let syncQueued = false

function scheduleSync() {
  if (syncQueued) return
  syncQueued = true
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, SYNC_DELAY_MS, () => { syncQueued = false; syncAll(); return GLib.SOURCE_REMOVE })
}

// SSID como texto (puede venir con bytes no UTF-8 o a cero en redes ocultas: esas quedan vacías).
function ssidText(ap: NM.AccessPoint): string {
  const bytes = ap.ssid
  if (!bytes) return ""
  return (NM.utils_ssid_to_utf8(bytes.toArray()) ?? "").replace(/\0/g, "").trim()
}

function pickWifiDevice(): NM.DeviceWifi | null {
  const devs = (client?.get_devices() ?? []).filter(d => d.device_type === NM.DeviceType.WIFI) as NM.DeviceWifi[]
  return devs.find(d => d.active_connection !== null) ?? devs[0] ?? null
}

function bindWifiDevice(dev: NM.DeviceWifi | null) {
  if (dev === wifiDev) return
  // OJO: NM.Device tiene su propio método disconnect(cancellable) (desconecta el dispositivo) que tapa al
  // disconnect(id) de GObject: para soltar señales de un dispositivo hay que usar signal_handler_disconnect.
  if (wifiDev) for (const id of devHandlers) GObject.signal_handler_disconnect(wifiDev, id)
  devHandlers = []
  wifiDev = dev
  if (dev) {
    devHandlers = [
      dev.connect("state-changed",           (_d: NM.Device, newState: number, oldState: number, reason: number) => onDeviceState(newState, oldState, reason)),
      dev.connect("notify::state",            scheduleSync),
      dev.connect("notify::active-access-point", scheduleSync),
      dev.connect("notify::last-scan",        onLastScan),
      dev.connect("access-point-added",       scheduleSync),
      dev.connect("access-point-removed",     scheduleSync),
    ]
  }
  setHasWifi(dev !== null)
  scheduleSync()
}

// Solo el AP activo notifica su intensidad (para el icono de la barra); el resto se lee al recalcular.
let activeApObj: NM.AccessPoint | null = null
let activeApHandler = 0

function bindActiveAp(ap: NM.AccessPoint | null) {
  if (ap === activeApObj) return
  if (activeApObj && activeApHandler) GObject.signal_handler_disconnect(activeApObj, activeApHandler)
  activeApObj = ap
  activeApHandler = ap ? ap.connect("notify::strength", scheduleSync) : 0
}

let prevEnabled = false

function syncRadio() {
  if (!client) return
  const enabled = client.wireless_enabled
  setWifiEnabledSt(enabled)
  setWifiHw(client.wireless_hardware_enabled)
  setConnectivity(client.connectivity)
  setPrimary(client.primary_connection?.type ?? "")
  if (enabled && !prevEnabled && listActive) GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => { scanWifi(); return GLib.SOURCE_REMOVE })
  if (!enabled && prevEnabled) { setPasswordFor(null); if (attempt.peek()?.phase === "failed") setAttempt(null) }
  prevEnabled = enabled
}

function syncDevice() {
  const dev = wifiDev
  if (!dev) { setDevState(DS.UNAVAILABLE); setActiveAp(null); bindActiveAp(null); return }
  setDevState(dev.state)
  const ap = dev.active_access_point
  bindActiveAp(ap)
  const next = ap ? { ssid: ssidText(ap), strength: ap.strength } : null
  const prev = activeAp.peek()
  if (next?.ssid !== prev?.ssid || next?.strength !== prev?.strength) setActiveAp(next)
}

// Ethernet: todos los dispositivos de ese tipo, con manejadores propios de cada uno.
const ethHandlers = new Map<NM.Device, number[]>()

function syncEthernet() {
  if (!client) return
  const devs = client.get_devices().filter(d => d.device_type === NM.DeviceType.ETHERNET) as NM.DeviceEthernet[]
  for (const d of devs) {
    if (ethHandlers.has(d)) continue
    ethHandlers.set(d, ["notify::state", "notify::carrier", "notify::speed", "notify::active-connection"].map(s => d.connect(s, scheduleSync)))
  }
  for (const d of [...ethHandlers.keys()]) if (!devs.includes(d as NM.DeviceEthernet)) ethHandlers.delete(d)
  const next = summarizeEthernet(devs.map(d => ({
    iface: d.interface, state: d.state, carrier: d.carrier, speed: d.speed, managed: d.managed,
  })))
  const prev = eth.peek()
  if (next.present !== prev.present || next.status !== prev.status || next.iface !== prev.iface || next.speed !== prev.speed) setEth(next)
}

// Redes visibles: un AP por SSID (el más fuerte). Un mismo SSID en varias bandas o con varios AP (mallas,
// redes corporativas) es una sola red. Si hay un perfil guardado válido para algún AP, se activa con ese.
function collectNets(): Map<string, WifiNet> {
  const out = new Map<string, WifiNet>()
  const dev = wifiDev
  if (!client || !dev) return out
  const conns = client.get_connections()
  const cur = dev.active_access_point
  const activeSsid = cur && dev.state === DS.ACTIVATED ? ssidText(cur) : null

  const groups = new Map<string, NM.AccessPoint[]>()
  for (const ap of dev.get_access_points()) {
    if (ap.mode !== AP_MODE_INFRA) continue
    const ssid = ssidText(ap)
    if (!ssid) continue
    const list = groups.get(ssid)
    if (list) list.push(ap); else groups.set(ssid, [ap])
  }
  for (const [ssid, aps] of groups) {
    aps.sort((a, b) => b.strength - a.strength)
    const best    = aps[0]
    const savedAp = aps.find(ap => conns.some(c => ap.connection_valid(c)))
    out.set(ssid, {
      ssid,
      strength: best.strength,
      security: securityOf(best.flags, best.wpa_flags, best.rsn_flags),
      saved:    savedAp !== undefined,
      active:   ssid === activeSsid,
      ap:       best,
      path:     (savedAp ?? best).get_path(),
    })
  }
  return out
}

const sortSsids = (m: Map<string, WifiNet>): string[] =>
  [...m.values()]
    .sort((a, b) => Number(b.active) - Number(a.active) || b.strength - a.strength || a.ssid.localeCompare(b.ssid))
    .map(n => n.ssid)

function recomputeNets() {
  const fresh = collectNets()
  const prevOrder = order.peek()

  // Mientras se escribe la contraseña o se conecta, no se mueven ni se quitan filas: <For> reordena
  // quitando y volviendo a añadir todas, y el campo de contraseña perdería el foco. Los datos sí se
  // actualizan, y una red que desaparece conserva su último dato hasta que se cierre el campo.
  if (passwordFor.peek() !== null || attempt.peek()?.phase === "connecting") {
    const prev = nets.peek()
    for (const ssid of prevOrder) if (!fresh.has(ssid) && prev.has(ssid)) fresh.set(ssid, prev.get(ssid)!)
    setNets(fresh)
    return
  }

  // El orden solo se recalcula al abrir el popup, al terminar un escaneo, al cambiar la red activa o
  // cuando cambia el conjunto de redes; un cambio de intensidad suelto no reordena la lista.
  const ssids   = [...fresh.keys()]
  const sameSet = ssids.length === prevOrder.length && ssids.every(s => prevOrder.includes(s))
  const activeChanged = prevOrder.length > 0 && !(fresh.get(prevOrder[0])?.active ?? false) && ssids.some(s => fresh.get(s)!.active)
  setNets(fresh)   // los datos primero: las filas nuevas los leen al crearse
  if (sortDirty || !sameSet || activeChanged) {
    const next = sortSsids(fresh)
    if (next.join("\n") !== prevOrder.join("\n")) setOrder(next)
    sortDirty = false
  }
}

function syncAll() {
  syncRadio()
  syncDevice()
  syncEthernet()
  if (listActive) recomputeNets()
}

// ── Escaneo ───────────────────────────────────────────────────────────────────────────────────
// NM.DeviceWifi.request_scan_async directo (no Wifi.scan() de Astal: deja `scanning` pegado si falla).
// El escaneo termina cuando NM actualiza last_scan; un temporizador de seguridad cubre que no llegue.

let lastScanAt = 0
let scanBefore = 0
let scanTimer  = 0

function finishScan() {
  if (scanTimer) { GLib.source_remove(scanTimer); scanTimer = 0 }
  if (!scanning.peek()) return
  setScanning(false)
  sortDirty = true
  scheduleSync()
}

function onLastScan() {
  if (scanning.peek() && wifiDev && wifiDev.last_scan !== scanBefore) finishScan()
}

export async function scanWifi() {
  const dev = wifiDev
  if (!dev || !wifiEnabled.peek() || scanning.peek()) return
  const now = GLib.get_monotonic_time() / 1000
  if (now - lastScanAt < SCAN_COOLDOWN_MS) return
  lastScanAt = now
  scanBefore = dev.last_scan
  setScanning(true)
  try {
    await dev.request_scan_async(null)
  } catch {
    setScanning(false)   // NM lo rechazó (demasiado pronto, dispositivo ocupado): se conserva la lista actual
    return
  }
  scanTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SCAN_SAFETY_MS, () => { scanTimer = 0; finishScan(); return GLib.SOURCE_REMOVE })
}

// ── Conectar ──────────────────────────────────────────────────────────────────────────────────

let attemptSaw   = false   // el dispositivo ya avanzó (PREPARE…SECONDARIES) en este intento
let attemptTimer = 0
let createdProfile: NM.RemoteConnection | null = null   // perfil creado por este intento (se borra si falla)

const clearAttemptTimer = () => { if (attemptTimer) { GLib.source_remove(attemptTimer); attemptTimer = 0 } }

// Cambió algo que congelaba la lista (campo de contraseña o intento en curso): se reordena.
function unfreeze() { sortDirty = true; scheduleSync() }

function beginAttempt(ssid: string) {
  clearAttemptTimer()
  attemptSaw = false
  createdProfile = null
  setAttempt({ ssid, phase: "connecting" })
  setPasswordFor(null)
  attemptTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, ATTEMPT_TIMEOUT_S, () => {
    attemptTimer = 0
    failAttempt(ssid, "Tiempo de espera agotado", false)
    return GLib.SOURCE_REMOVE
  })
}

function endAttempt() {
  clearAttemptTimer()
  createdProfile = null
  setAttempt(null)
  setPasswordFor(null)
  unfreeze()
}

function failAttempt(ssid: string, message: string, retry: boolean) {
  clearAttemptTimer()
  const created = createdProfile
  createdProfile = null
  setAttempt({ ssid, phase: "failed", message, retryWithPassword: retry })
  if (retry) setPasswordFor(ssid)
  unfreeze()
  // Un perfil que creó este intento con una clave que no sirvió no se deja guardado: NM lo reintentaría solo.
  created?.delete_async(null).catch(() => {})
}

function onDeviceState(newState: number, _oldState: number, reason: number) {
  const at = attempt.peek()
  if (!at || at.phase !== "connecting") return
  const ap  = wifiDev?.active_access_point
  const sec = nets.peek().get(at.ssid)?.security
  const r   = stepAttempt(at, attemptSaw, { state: newState, reason }, ap ? ssidText(ap) : null, sec !== undefined && needsPassword(sec))
  attemptSaw = r.sawProgress
  if (r.attempt === null) endAttempt()
  else if (r.attempt.phase === "failed") failAttempt(r.attempt.ssid, r.attempt.message, r.attempt.retryWithPassword)
}

const UNSUPPORTED: Partial<Record<Security, string>> = {
  eap:         "Red empresarial (802.1X): usa Configuración avanzada",
  wep:         "Red WEP no compatible: usa Configuración avanzada",
  unsupported: "Seguridad no compatible: usa Configuración avanzada",
}

async function connectTo(net: WifiNet, password?: string) {
  if (!client || !wifiDev) return
  if (attempt.peek()?.phase === "connecting") return
  const security = net.security
  if (security === "eap" || security === "wep" || security === "unsupported") {
    setAttempt({ ssid: net.ssid, phase: "failed", message: UNSUPPORTED[security]!, retryWithPassword: false })
    return
  }
  // WPA2-personal: 8–63 caracteres o 64 hex (NM.utils_wpa_psk_valid; connection.verify() NO lo comprueba).
  // WPA3-personal (SAE) admite una contraseña de cualquier longitud.
  const invalid = password !== undefined && (security === "psk" ? !NM.utils_wpa_psk_valid(password) : password === "")
  if (invalid) {
    setAttempt({ ssid: net.ssid, phase: "failed", retryWithPassword: true,
                 message: security === "psk" ? "La contraseña debe tener de 8 a 63 caracteres" : "Escribe la contraseña" })
    setPasswordFor(net.ssid)
    return
  }

  beginAttempt(net.ssid)
  try {
    const saved = client.get_connections().filter(c => net.ap.connection_valid(c)) as NM.RemoteConnection[]
    if (saved.length > 0) {
      const conn = saved[0]
      if (password !== undefined) {
        // Clave nueva para un perfil guardado (la anterior falló o la red la cambió).
        const sec = conn.get_setting_wireless_security()
        if (sec) { sec.psk = password; await conn.commit_changes_async(true, null) }
      }
      await client.activate_connection_async(conn, wifiDev, net.path, null)
    } else {
      const conn = buildConnection(net.ap.ssid, net.ssid, security, password ?? null)
      conn.verify()
      const ac = await client.add_and_activate_connection_async(conn, wifiDev, net.path, null)
      createdProfile = ac.connection as NM.RemoteConnection | null
    }
  } catch (e) {
    // No se registra el mensaje con la clave: los errores de NM no la incluyen, pero tampoco hace falta.
    console.warn(`network: no se pudo activar «${net.ssid}»: ${(e as Error).message}`)
    failAttempt(net.ssid, "No se pudo crear la conexión", false)
  }
}

// ── Acciones para la interfaz ─────────────────────────────────────────────────────────────────

function setWifiEnabled(on: boolean) { if (client) client.wireless_enabled = on }

// Clic en una fila: abiertas y guardadas se conectan de inmediato; las nuevas con clave abren el campo de contraseña.
function selectNetwork(ssid: string) {
  const net = nets.peek().get(ssid)
  if (!net || net.active || attempt.peek()?.phase === "connecting") return
  setAttempt(null)
  if (net.saved || net.security === "open" || net.security === "owe") { connectTo(net); return }
  if (needsPassword(net.security)) { setPasswordFor(passwordFor.peek() === ssid ? null : ssid); unfreeze(); return }
  connectTo(net)   // enterprise / WEP / otras: deja el mensaje de "usa Configuración avanzada"
}

function connectWithPassword(ssid: string, password: string) {
  const net = nets.peek().get(ssid)
  if (net) connectTo(net, password)
}

function cancelPassword() {
  const at = attempt.peek()
  if (at?.phase === "failed") setAttempt(null)
  setPasswordFor(null)
  unfreeze()
}

async function disconnectWifi() {
  const ac = wifiDev?.active_connection
  if (!client || !ac) return
  try { await client.deactivate_connection_async(ac, null) }
  catch (e) { console.warn(`network: no se pudo desconectar: ${(e as Error).message}`) }
}

// nm-connection-editor (ya instalado) cubre lo que el popup no hace: 802.1X, redes ocultas, IP fija, VPN.
// Se lanza desde Hyprland y no como hijo de AGS, para que sobreviva si la barra se reinicia.
function openAdvanced() { execAsync(["hyprctl", "dispatch", "exec", "nm-connection-editor"]).catch(() => {}) }

function popupShown() {
  listActive = true
  sortDirty  = true
  syncAll()
  scanWifi()
}

function popupHidden() {
  listActive = false
  setPasswordFor(null)
  if (attempt.peek()?.phase === "failed") setAttempt(null)
}

// ── Interfaz pública ──────────────────────────────────────────────────────────────────────────
// NetworkPopup recibe un NetStore (por defecto el real): así se puede dibujar con datos de prueba
// (Wi-Fi apagado, conectando, error…) sin tocar la red de verdad.

export type NetStore = {
  hasNM:       boolean
  hasWifi:     Accessor<boolean>
  wifiEnabled: Accessor<boolean>
  wifiHw:      Accessor<boolean>
  scanning:    Accessor<boolean>
  nets:        Accessor<Map<string, WifiNet>>
  order:       Accessor<string[]>
  attempt:     Accessor<Attempt | null>
  passwordFor: Accessor<string | null>
  eth:         Accessor<EthView>
  setWifiEnabled(on: boolean): void
  scan(): void
  select(ssid: string): void
  connect(ssid: string, password: string): void
  cancelPassword(): void
  disconnect(): void
  openAdvanced(): void
  onShow(): void
  onHide(): void
}

export const netStore: NetStore = {
  hasNM: client !== null,
  hasWifi, wifiEnabled, wifiHw, scanning, nets, order, attempt, passwordFor, eth,
  setWifiEnabled,
  scan: () => { scanWifi() },
  select: selectNetwork,
  connect: connectWithPassword,
  cancelPassword,
  disconnect: () => { disconnectWifi() },
  openAdvanced,
  onShow: popupShown,
  onHide: popupHidden,
}

// ── Arranque ──────────────────────────────────────────────────────────────────────────────────

if (client) {
  client.connect("notify::wireless-enabled",          scheduleSync)
  client.connect("notify::wireless-hardware-enabled", scheduleSync)
  client.connect("notify::connectivity",              scheduleSync)
  client.connect("notify::primary-connection",        scheduleSync)
  client.connect("connection-added",                  scheduleSync)
  client.connect("connection-removed",                scheduleSync)
  const onDevices = () => {
    if (!wifiDev || !client.get_devices().includes(wifiDev)) bindWifiDevice(pickWifiDevice())
    scheduleSync()
  }
  client.connect("device-added",   onDevices)
  client.connect("device-removed", onDevices)
  bindWifiDevice(pickWifiDevice())
  prevEnabled = client.wireless_enabled
  syncAll()
}
