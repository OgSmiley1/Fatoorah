export const logger = {
  debug(event: string, meta: any = {}) {
    // console.debug(`[DEBUG] ${new Date().toISOString()} - ${event}`, JSON.stringify(meta));
  },
  info(event: string, meta: any = {}) {
    console.log(`[INFO] ${new Date().toISOString()} - ${event}`, JSON.stringify(meta));
  },
  warn(event: string, meta: any = {}) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${event}`, JSON.stringify(meta));
  },
  error(event: string, meta: any = {}) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${event}`, JSON.stringify(meta));
  }
};
