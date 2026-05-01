import { logger } from "./logger";

export interface NetworkStatus {
  online: boolean;
  quality: "excellent" | "good" | "poor" | "offline";
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

class NetworkMonitor {
  private static instance: NetworkMonitor;
  private listeners: Set<(status: NetworkStatus) => void> = new Set();
  private currentStatus: NetworkStatus;

  private constructor() {
    this.currentStatus = this.readNetworkStatus();
    this.setupListeners();
    logger.info("NetworkMonitor initialized", "NetworkMonitor", {
      initialStatus: this.currentStatus,
    });
  }

  static getInstance(): NetworkMonitor {
    if (!NetworkMonitor.instance) {
      NetworkMonitor.instance = new NetworkMonitor();
    }
    return NetworkMonitor.instance;
  }

  private setupListeners(): void {
    if (typeof window === "undefined") return;
    window.addEventListener("online", () => this.handleNetworkChange());
    window.addEventListener("offline", () => this.handleNetworkChange());

    const conn = (navigator as unknown as { connection?: EventTarget }).connection;
    conn?.addEventListener?.("change", () => this.handleNetworkChange());
  }

  private handleNetworkChange(): void {
    const previous = this.currentStatus;
    this.currentStatus = this.readNetworkStatus();
    logger.info("Network status changed", "NetworkMonitor", {
      from: previous,
      to: this.currentStatus,
    });
    logger.addBreadcrumb(
      `Network: ${previous.quality} → ${this.currentStatus.quality}`
    );
    this.listeners.forEach((cb) => cb(this.currentStatus));
  }

  private readNetworkStatus(): NetworkStatus {
    if (typeof navigator === "undefined") {
      return { online: true, quality: "good" };
    }
    if (!navigator.onLine) return { online: false, quality: "offline" };

    const conn = (navigator as unknown as {
      connection?: {
        effectiveType?: string;
        downlink?: number;
        rtt?: number;
        saveData?: boolean;
      };
    }).connection;

    if (conn) {
      const { effectiveType, downlink = 0, rtt = 0, saveData } = conn;
      let quality: NetworkStatus["quality"] = "good";
      if (effectiveType === "4g" && downlink > 5) quality = "excellent";
      else if (effectiveType === "3g" || (effectiveType === "4g" && downlink < 2))
        quality = "poor";
      else if (rtt > 300) quality = "poor";
      return { online: true, quality, effectiveType, downlink, rtt, saveData };
    }
    return { online: true, quality: "good" };
  }

  getStatus(): NetworkStatus {
    return this.currentStatus;
  }

  shouldSync(): boolean {
    return this.currentStatus.online && this.currentStatus.quality !== "offline";
  }

  shouldDelaySync(): boolean {
    return (
      this.currentStatus.quality === "poor" || !!this.currentStatus.saveData
    );
  }

  getSyncDelay(): number {
    switch (this.currentStatus.quality) {
      case "excellent":
        return 1000;
      case "good":
        return 3000;
      case "poor":
        return 10000;
      default:
        return 5000;
    }
  }

  subscribe(cb: (status: NetworkStatus) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}

export const networkMonitor = NetworkMonitor.getInstance();
