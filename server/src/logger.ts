import { env } from "./env";

const isDev = env.NODE_ENV === "development";

export const loggerOptions = isDev
  ? {
      level: env.LOG_LEVEL,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
    }
  : { level: env.LOG_LEVEL };
