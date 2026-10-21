/**
 * Physically plausible materials for the LA072 kit, shared by every mesh (one material per
 * finish, never one per mesh). Colors come from the product photos: black acrylic, silver
 * screws, brass standoffs, black PCBs, the blue HC-SR04, translucent MG90S cases with pink
 * labels, warm servo wires. No neon on the hardware.
 *
 * Labels are drawn on a canvas with the system sans-serif (no font downloads). Without a DOM
 * (unit tests) they fall back to flat colors.
 */

import * as THREE from "three";

export interface SpiderMaterials {
  acrylic: THREE.MeshPhysicalMaterial;
  silver: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  pcbBlack: THREE.MeshStandardMaterial;
  pcbBlue: THREE.MeshStandardMaterial;
  shield: THREE.MeshStandardMaterial;
  servoCase: THREE.MeshPhysicalMaterial;
  servoDark: THREE.MeshStandardMaterial;
  servoLabel: THREE.MeshStandardMaterial;
  horn: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  plastic: THREE.MeshStandardMaterial;
  header: THREE.MeshStandardMaterial;
  capacitor: THREE.MeshStandardMaterial;
  sonarMesh: THREE.MeshStandardMaterial;
  wireBrown: THREE.MeshStandardMaterial;
  wireRed: THREE.MeshStandardMaterial;
  wireOrange: THREE.MeshStandardMaterial;
  ledRed: THREE.MeshStandardMaterial;
  ledGreen: THREE.MeshStandardMaterial;
  ledBlue: THREE.MeshStandardMaterial;
  coverMark: THREE.MeshStandardMaterial;
  sonarSilk: THREE.MeshStandardMaterial;
}

export const PALETTE = {
  acrylic: 0x0d1015,
  silver: 0xc9ced6,
  brass: 0xb08d57,
  pcbBlack: 0x15181d,
  pcbBlue: 0x123f8a,
  shield: 0xd2d6dc,
  servoCase: 0x3d322d,
  servoDark: 0x1a1412,
  pink: 0xd81b8c,
  rubber: 0x0a0a0a,
  plastic: 0x121316,
  header: 0x1f4fbf,
  wireBrown: 0x6b3f1d,
  wireRed: 0xc0392b,
  wireOrange: 0xe67e22,
} as const;

function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  anisotropy: number,
): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

const SANS = "system-ui, 'Segoe UI', Roboto, sans-serif";

/** Pink MG90S sticker: "MG90S" over "Micro servo", as on the kit's servos. */
function servoLabelTexture(anisotropy: number): THREE.CanvasTexture | null {
  return canvasTexture(
    512,
    256,
    (ctx) => {
      ctx.fillStyle = "#d81b8c";
      ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = "#1b0a12";
      ctx.fillRect(28, 26, 456, 120);
      ctx.fillStyle = "#f4d7e7";
      ctx.font = `700 92px ${SANS}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("MG90S", 256, 88);
      ctx.fillStyle = "#1b0a12";
      ctx.font = `600 60px ${SANS}`;
      ctx.fillText("Micro servo", 256, 198);
    },
    anisotropy,
  );
}

/** Laser-etched LAFVIN mark on the cover: low contrast, readable only up close. */
function coverMarkTexture(anisotropy: number): THREE.CanvasTexture | null {
  return canvasTexture(
    512,
    512,
    (ctx) => {
      ctx.clearRect(0, 0, 512, 512);
      ctx.strokeStyle = "rgba(190,198,210,0.55)";
      ctx.fillStyle = "rgba(190,198,210,0.55)";
      ctx.lineWidth = 10;
      ctx.strokeRect(186, 120, 140, 140);
      ctx.beginPath();
      ctx.moveTo(222, 145);
      ctx.lineTo(222, 232);
      ctx.lineTo(296, 232);
      ctx.stroke();
      ctx.font = `600 64px ${SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("LAFVIN", 256, 350);
    },
    anisotropy,
  );
}

/** HC-SR04 silkscreen: "HC-SR04", "T" and "R" marks in white on blue. */
function sonarSilkTexture(anisotropy: number): THREE.CanvasTexture | null {
  return canvasTexture(
    512,
    256,
    (ctx) => {
      ctx.fillStyle = "#123f8a";
      ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = "#e8eef8";
      ctx.font = `700 40px ${SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("HC-SR04", 256, 52);
      ctx.font = `700 34px ${SANS}`;
      ctx.fillText("T", 40, 230);
      ctx.fillText("R", 472, 230);
      ctx.font = `600 22px ${SANS}`;
      ctx.fillText("Vcc  Trig  Echo  Gnd", 256, 236);
    },
    anisotropy,
  );
}

/** ESP-12F shield marking. */
function shieldTexture(anisotropy: number): THREE.CanvasTexture | null {
  return canvasTexture(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = "#d2d6dc";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#5b616b";
      ctx.font = `700 40px ${SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("ESP-12F", 128, 110);
      ctx.font = `500 22px ${SANS}`;
      ctx.fillText("Wi-Fi  ESP8266MOD", 128, 160);
    },
    anisotropy,
  );
}

export function createMaterials(anisotropy = 4): SpiderMaterials {
  const std = (color: number, roughness: number, metalness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const led = (color: number) => std(color, 0.4, 0, { emissive: color, emissiveIntensity: 0.9 });
  const label = servoLabelTexture(anisotropy);
  const mark = coverMarkTexture(anisotropy);
  const silk = sonarSilkTexture(anisotropy);
  const shield = shieldTexture(anisotropy);
  return {
    acrylic: new THREE.MeshPhysicalMaterial({
      color: PALETTE.acrylic,
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.35,
    }),
    silver: std(PALETTE.silver, 0.28, 0.95),
    brass: std(PALETTE.brass, 0.32, 1),
    pcbBlack: std(PALETTE.pcbBlack, 0.6, 0.1),
    pcbBlue: std(PALETTE.pcbBlue, 0.55, 0.1),
    shield: std(0xffffff, 0.3, 0.85, { map: shield ?? undefined, color: shield ? 0xffffff : PALETTE.shield }),
    servoCase: new THREE.MeshPhysicalMaterial({
      color: PALETTE.servoCase,
      roughness: 0.35,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
      transparent: true,
      opacity: 0.82,
    }),
    servoDark: std(PALETTE.servoDark, 0.5, 0),
    servoLabel: std(label ? 0xffffff : PALETTE.pink, 0.5, 0, { map: label ?? undefined }),
    horn: std(0x111215, 0.55, 0),
    rubber: std(PALETTE.rubber, 0.95, 0),
    plastic: std(PALETTE.plastic, 0.7, 0),
    header: std(PALETTE.header, 0.5, 0),
    capacitor: std(0x2a2d33, 0.45, 0.2),
    sonarMesh: std(0x0a0a0a, 0.9, 0),
    wireBrown: std(PALETTE.wireBrown, 0.6, 0),
    wireRed: std(PALETTE.wireRed, 0.6, 0),
    wireOrange: std(PALETTE.wireOrange, 0.6, 0),
    ledRed: led(0xff3b30),
    ledGreen: led(0x34d399),
    ledBlue: led(0x3b82f6),
    coverMark: std(0xffffff, 0.6, 0, {
      map: mark ?? undefined,
      transparent: true,
      opacity: mark ? 1 : 0,
      depthWrite: false,
    }),
    sonarSilk: std(silk ? 0xffffff : PALETTE.pcbBlue, 0.55, 0.1, { map: silk ?? undefined }),
  };
}

export function disposeMaterials(m: SpiderMaterials): void {
  for (const mat of Object.values(m) as THREE.MeshStandardMaterial[]) {
    mat.map?.dispose();
    mat.dispose();
  }
}
