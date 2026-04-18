import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, Html } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ProductChannelRow } from "./StrategyGrid";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HotLead {
  lead_id: string;
  full_name: string;
  company: string;
  product_key: string;
  channels: string[] | null;
  opens: number;
  clicks: number;
  replies: number;
  wa_delivered: number;
  fit_score: number;
  intent_score: number;
  db_eng_score: number;
  activity_score: number;
  total_score: number;
  last_activity: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHANNEL_KEYS = ["email","whatsapp","calling","google_ads","meta_ads","linkedin","blog","social"];
const CHANNEL_LABELS: Record<string,string> = {
  email: "Email", whatsapp: "WA", calling: "Call",
  google_ads: "GAds", meta_ads: "Meta", linkedin: "LI", blog: "Blog", social: "Social",
};
const CHANNEL_COLORS: Record<string,string> = {
  email: "#3b82f6", whatsapp: "#10b981", calling: "#8b5cf6",
  google_ads: "#f59e0b", meta_ads: "#6366f1", linkedin: "#0077b5",
  blog: "#06b6d4", social: "#ec4899",
};

// ─── Prism Matrix ─────────────────────────────────────────────────────────────

function PrismBar({
  position,
  height,
  color,
  label,
  value,
}: {
  position: [number, number, number];
  height: number;
  color: string;
  label: string;
  value: string;
}) {
  const [hovered, setHovered] = useState(false);
  const h = Math.max(0.05, height);

  return (
    <group position={[position[0], h / 2, position[2]]}>
      <mesh
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[0.55, h, 0.55]} />
        <meshStandardMaterial
          color={color}
          roughness={0.3}
          metalness={0.1}
          opacity={hovered ? 1 : 0.85}
          transparent
        />
      </mesh>
      {hovered && (
        <Html position={[0, h / 2 + 0.3, 0]} center distanceFactor={8}>
          <div className="bg-popover border rounded-lg px-2 py-1 text-xs shadow-lg whitespace-nowrap pointer-events-none">
            <div className="font-semibold">{label}</div>
            <div className="text-muted-foreground">{value}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

function PrismMatrix({ rows }: { rows: ProductChannelRow[] }) {
  const productMap = useMemo(() => {
    const m = new Map<string, Map<string,ProductChannelRow>>();
    for (const row of rows) {
      if (!m.has(row.product_key)) m.set(row.product_key, new Map());
      m.get(row.product_key)!.set(row.channel, row);
    }
    return m;
  }, [rows]);

  const products = useMemo(() => [...productMap.keys()].sort(), [productMap]);
  const maxSent = useMemo(() => Math.max(...rows.map(r => Number(r.sent)), 1), [rows]);

  const SCALE = 5; // max bar height
  const X_STEP = 1.1;
  const Z_STEP = 1.4;

  return (
    <group>
      {/* Axis labels — channels on X */}
      {CHANNEL_KEYS.map((ch, ci) => (
        <Text
          key={ch}
          position={[ci * X_STEP - ((CHANNEL_KEYS.length - 1) * X_STEP) / 2, -0.15, (products.length * Z_STEP) / 2 + 0.5]}
          fontSize={0.18}
          color="#94a3b8"
          anchorX="center"
          anchorY="top"
        >
          {CHANNEL_LABELS[ch] ?? ch}
        </Text>
      ))}

      {/* Product labels on Z */}
      {products.map((p, pi) => (
        <Text
          key={p}
          position={[-(CHANNEL_KEYS.length * X_STEP) / 2 - 0.2, -0.15, pi * Z_STEP - ((products.length - 1) * Z_STEP) / 2]}
          fontSize={0.18}
          color="#94a3b8"
          anchorX="right"
          anchorY="middle"
        >
          {p}
        </Text>
      ))}

      {/* Bars */}
      {CHANNEL_KEYS.map((ch, ci) => {
        const x = ci * X_STEP - ((CHANNEL_KEYS.length - 1) * X_STEP) / 2;
        return products.map((p, pi) => {
          const row = productMap.get(p)?.get(ch);
          const sent = Number(row?.sent ?? 0);
          const height = (sent / maxSent) * SCALE;
          const z = pi * Z_STEP - ((products.length - 1) * Z_STEP) / 2;
          return (
            <PrismBar
              key={`${p}-${ch}`}
              position={[x, 0, z]}
              height={height}
              color={CHANNEL_COLORS[ch] ?? "#888"}
              label={`${p} · ${CHANNEL_LABELS[ch] ?? ch}`}
              value={`${sent.toLocaleString()} sent`}
            />
          );
        });
      })}

      {/* Floor grid */}
      <gridHelper
        args={[
          Math.max(CHANNEL_KEYS.length, products.length) * 1.5,
          Math.max(CHANNEL_KEYS.length, products.length),
          "#e2e8f0",
          "#f1f5f9",
        ]}
        position={[0, -0.02, 0]}
      />
    </group>
  );
}

// ─── Lead Constellation ───────────────────────────────────────────────────────

function LeadSphere({ lead, maxScore }: { lead: HotLead; maxScore: number }) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);

  const SCALE = 4;
  const x = ((Number(lead.fit_score) / 100) * SCALE) - SCALE / 2;
  const y = (Number(lead.intent_score) / 100) * SCALE;
  const z = ((Number(lead.db_eng_score) / 100) * SCALE) - SCALE / 2;
  const size = 0.05 + (Number(lead.total_score) / maxScore) * 0.25;

  // Color by total score: blue → orange → red
  const t = Number(lead.total_score) / maxScore;
  const color = new THREE.Color().setHSL(0.6 - t * 0.55, 0.9, 0.55);

  return (
    <group position={[x, y, z]}>
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[size, 12, 12]} />
        <meshStandardMaterial
          color={color}
          roughness={0.2}
          metalness={0.3}
          emissive={color}
          emissiveIntensity={hovered ? 0.5 : 0.1}
        />
      </mesh>
      {hovered && (
        <Html position={[0, size + 0.1, 0]} center distanceFactor={8}>
          <div className="bg-popover border rounded-lg px-2 py-1.5 text-xs shadow-lg whitespace-nowrap pointer-events-none min-w-[140px]">
            <div className="font-semibold truncate">{lead.full_name || "Unknown"}</div>
            {lead.company && <div className="text-muted-foreground text-[10px]">{lead.company}</div>}
            <div className="mt-1 space-y-0.5 text-[10px]">
              <div>Fit: <span className="font-mono">{lead.fit_score}</span></div>
              <div>Intent: <span className="font-mono">{lead.intent_score}</span></div>
              <div>Engagement: <span className="font-mono">{lead.db_eng_score}</span></div>
              <div className="text-orange-600 font-semibold">Total: {lead.total_score}</div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

function LeadConstellation({ leads }: { leads: HotLead[] }) {
  const maxScore = useMemo(() => Math.max(...leads.map(l => Number(l.total_score)), 1), [leads]);
  const SCALE = 4;

  return (
    <group>
      {/* Axis lines */}
      <line>
        <bufferGeometry setFromPoints={[new THREE.Vector3(-SCALE/2, 0, 0), new THREE.Vector3(SCALE/2, 0, 0)]} />
        <lineBasicMaterial color="#e2e8f0" />
      </line>
      <line>
        <bufferGeometry setFromPoints={[new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, SCALE, 0)]} />
        <lineBasicMaterial color="#e2e8f0" />
      </line>
      <line>
        <bufferGeometry setFromPoints={[new THREE.Vector3(0, 0, -SCALE/2), new THREE.Vector3(0, 0, SCALE/2)]} />
        <lineBasicMaterial color="#e2e8f0" />
      </line>

      {/* Axis labels */}
      <Text position={[SCALE/2 + 0.3, 0, 0]} fontSize={0.2} color="#94a3b8" anchorX="left">Fit</Text>
      <Text position={[0, SCALE + 0.3, 0]} fontSize={0.2} color="#94a3b8" anchorX="center">Intent</Text>
      <Text position={[0, 0, SCALE/2 + 0.3]} fontSize={0.2} color="#94a3b8" anchorX="left">Engagement</Text>

      {/* Lead spheres */}
      {leads.map(lead => (
        <LeadSphere key={lead.lead_id} lead={lead} maxScore={maxScore} />
      ))}

      {/* Grid floor */}
      <gridHelper args={[SCALE, 8, "#e2e8f0", "#f1f5f9"]} position={[0, 0, 0]} />
    </group>
  );
}

// ─── Main ThreeDView ──────────────────────────────────────────────────────────

type Mode = "prism" | "constellation";

export function ThreeDView({
  channelRows,
  hotLeads,
}: {
  channelRows: ProductChannelRow[];
  hotLeads: HotLead[];
}) {
  const [mode, setMode] = useState<Mode>("prism");

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">
            {mode === "prism" ? "Prism Matrix — Channel Volume by Product" : "Lead Constellation — Fit · Intent · Engagement"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {mode === "prism"
              ? "Bar height = messages sent · Drag to rotate · Scroll to zoom"
              : "Sphere position = score axes · Size + color = total score · Hover for details"}
          </div>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setMode("prism")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === "prism"
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            3D-A Prism Matrix
          </button>
          <button
            onClick={() => setMode("constellation")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === "constellation"
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            3D-C Lead Space
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="rounded-xl border overflow-hidden bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900" style={{ height: 520 }}>
        <Canvas
          camera={{ position: [6, 5, 8], fov: 45 }}
          gl={{ antialias: true }}
          shadows
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 10, 5]} intensity={0.8} castShadow />
          <directionalLight position={[-5, 5, -5]} intensity={0.3} />

          {mode === "prism" ? (
            <PrismMatrix rows={channelRows} />
          ) : (
            <LeadConstellation leads={hotLeads} />
          )}

          <OrbitControls
            enablePan
            enableZoom
            enableRotate
            minDistance={2}
            maxDistance={25}
            dampingFactor={0.1}
            enableDamping
          />
        </Canvas>
      </div>

      {/* Mode-specific legend */}
      {mode === "prism" && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(CHANNEL_COLORS).map(([ch, color]) => (
            <div key={ch} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
              {CHANNEL_LABELS[ch] ?? ch}
            </div>
          ))}
        </div>
      )}
      {mode === "constellation" && (
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            Low score
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-orange-400" />
            High score
          </div>
          <span>·</span>
          <span>Larger sphere = higher total score</span>
        </div>
      )}
    </div>
  );
}
