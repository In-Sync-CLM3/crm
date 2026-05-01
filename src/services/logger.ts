type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  scope?: string;
  data?: unknown;
}

const MAX_BREADCRUMBS = 50;

class Logger {
  private breadcrumbs: string[] = [];

  private write(level: LogLevel, message: string, scope?: string, data?: unknown) {
    const entry: LogEntry = { timestamp: Date.now(), level, message, scope, data };
    const prefix = scope ? `[${scope}]` : "";
    const line = `${prefix} ${message}`;
    if (level === "error") console.error(line, data ?? "");
    else if (level === "warn") console.warn(line, data ?? "");
    else if (level === "debug") console.debug(line, data ?? "");
    else console.log(line, data ?? "");
    return entry;
  }

  debug(message: string, scope?: string, data?: unknown) {
    this.write("debug", message, scope, data);
  }
  info(message: string, scope?: string, data?: unknown) {
    this.write("info", message, scope, data);
  }
  warn(message: string, scope?: string, data?: unknown) {
    this.write("warn", message, scope, data);
  }
  error(message: string, scope?: string, data?: unknown) {
    this.write("error", message, scope, data);
  }

  addBreadcrumb(crumb: string) {
    this.breadcrumbs.push(`${new Date().toISOString()} ${crumb}`);
    if (this.breadcrumbs.length > MAX_BREADCRUMBS) {
      this.breadcrumbs.shift();
    }
  }

  getBreadcrumbs(): string[] {
    return [...this.breadcrumbs];
  }
}

export const logger = new Logger();
