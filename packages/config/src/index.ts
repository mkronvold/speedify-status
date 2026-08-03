export const appName = 'speedify-status';
export const appFullName = 'Speedify Status';
export const appRepositoryUrl = 'https://github.com/mkronvold/speedify-status';
export const appVersion = '0.0.0';

/** Planned public hostname (NPM / reverse proxy); not required for local MVP. */
export const defaultPublicHost = 'speedify.kronvold.org';

export const defaultPorts = {
  api: 4090,
  web: 5174,
} as const;

/**
 * Read an environment variable with an optional default.
 * Throws when the variable is missing and no default is provided.
 */
export function env(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing required environment variable: ${name}`);
}

/**
 * Read a port from the environment, falling back to a default.
 */
export function envPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port for ${name}: ${raw}`);
  }
  return parsed;
}
