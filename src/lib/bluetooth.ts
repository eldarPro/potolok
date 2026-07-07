import { BleClient, BleDevice, ScanResult, numberToUUID } from '@capacitor-community/bluetooth-le';

// ── Known device profiles ──────────────────────────────────────────────────

// Leica DISTO (D2 BT, D3a BT, E7100i, S910, ...)
const LEICA_SERVICE    = '3ab10100-f831-4395-b29d-570977d5bf94';
const LEICA_CHAR_MEAS  = '3ab10101-f831-4395-b29d-570977d5bf94';

// Bosch GLM (50-27 CG, 100-25 C, 150 C, ...)
const BOSCH_SERVICE    = '00005301-0000-0041-4c50-574954484f55';
const BOSCH_CHAR_MEAS  = '00005302-0000-0041-4c50-574954484f55';

// Nordic UART Service — fallback for generic BLE-serial disto meters
const UART_SERVICE     = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_CHAR_TX     = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

export type DeviceProfile = 'leica' | 'bosch' | 'uart' | 'unknown';

export interface BleDistometer {
  id: string;
  name: string;
  profile: DeviceProfile;
}

type MeasCb = (meters: number) => void;
type DisconnectCb = () => void;

let initialized = false;

async function ensureInit() {
  if (!initialized) {
    await BleClient.initialize({ androidNeverForLocation: true });
    initialized = true;
  }
}

/** Scan ~5 s, resolve with found devices (filtered by known name prefixes) */
export async function scanDistometers(
  onFound: (d: BleDistometer) => void,
  signal: AbortSignal,
): Promise<void> {
  await ensureInit();

  const seen = new Set<string>();

  await BleClient.requestLEScan(
    {
      services: [LEICA_SERVICE, BOSCH_SERVICE, UART_SERVICE],
      allowDuplicates: false,
    },
    (result: ScanResult) => {
      if (seen.has(result.device.deviceId)) return;
      seen.add(result.device.deviceId);
      const name = result.device.name ?? result.localName ?? '';
      onFound({ id: result.device.deviceId, name: name || result.device.deviceId, profile: guessProfile(name) });
    },
  );

  signal.addEventListener('abort', () => {
    BleClient.stopLEScan().catch(() => {});
  });
}

export async function stopScan() {
  await BleClient.stopLEScan().catch(() => {});
}

/** Connect to a device, subscribe to measurements, return cleanup fn */
export async function connectDistometer(
  device: BleDistometer,
  onMeasurement: MeasCb,
  onDisconnect: DisconnectCb,
): Promise<() => void> {
  await ensureInit();

  await BleClient.connect(device.id, () => onDisconnect());

  let cleanup: () => void;

  try {
    if (device.profile === 'leica') {
      await BleClient.startNotifications(device.id, LEICA_SERVICE, LEICA_CHAR_MEAS, (view) => {
        const m = parseLeica(view);
        if (m !== null) onMeasurement(m);
      });
      cleanup = () => BleClient.stopNotifications(device.id, LEICA_SERVICE, LEICA_CHAR_MEAS).catch(() => {});
    } else if (device.profile === 'bosch') {
      await BleClient.startNotifications(device.id, BOSCH_SERVICE, BOSCH_CHAR_MEAS, (view) => {
        const m = parseBosch(view);
        if (m !== null) onMeasurement(m);
      });
      cleanup = () => BleClient.stopNotifications(device.id, BOSCH_SERVICE, BOSCH_CHAR_MEAS).catch(() => {});
    } else {
      // Generic UART fallback
      await BleClient.startNotifications(device.id, UART_SERVICE, UART_CHAR_TX, (view) => {
        const m = parseUart(view);
        if (m !== null) onMeasurement(m);
      });
      cleanup = () => BleClient.stopNotifications(device.id, UART_SERVICE, UART_CHAR_TX).catch(() => {});
    }
  } catch {
    // Fallback: try all profiles
    await BleClient.disconnect(device.id).catch(() => {});
    throw new Error('Устройство не поддерживается или недоступно');
  }

  return async () => {
    cleanup();
    await BleClient.disconnect(device.id).catch(() => {});
  };
}

// ── Profile detection ──────────────────────────────────────────────────────

function guessProfile(name: string): DeviceProfile {
  const n = name.toUpperCase();
  if (n.includes('DISTO') || n.includes('LEICA')) return 'leica';
  if (n.includes('GLM') || n.includes('BOSCH')) return 'bosch';
  return 'uart';
}

// ── Data parsers ───────────────────────────────────────────────────────────

/**
 * Leica DISTO BLE notification: 10 bytes
 * Bytes 0–3: Int32LE, units of 0.1 mm → divide by 10 000 for meters
 */
function parseLeica(view: DataView): number | null {
  if (view.byteLength < 4) return null;
  const raw = view.getInt32(0, true);
  const m = raw / 10000;
  return inRange(m) ? round(m) : null;
}

/**
 * Bosch GLM BLE notification: Float32LE in meters
 */
function parseBosch(view: DataView): number | null {
  if (view.byteLength < 4) return null;
  const m = view.getFloat32(0, true);
  return inRange(m) ? round(m) : null;
}

/**
 * Generic UART (ASCII): e.g. "q+00023.540 m  " or just "3.54\r\n"
 */
function parseUart(view: DataView): number | null {
  const text = new TextDecoder().decode(view).trim();
  // Extract first number found
  const match = text.match(/[\d]+\.[\d]+/);
  if (!match) return null;
  const m = parseFloat(match[0]);
  return inRange(m) ? round(m) : null;
}

function inRange(m: number): boolean {
  return isFinite(m) && m >= 0.1 && m <= 50;
}

function round(m: number): number {
  return Math.round(m * 1000) / 1000;
}
