import {
  createPublicClient,
  createSecureClient,
  type PublicClient,
  type SecureClient,
} from "@polymarket/client";
import { privateKey } from "@polymarket/client/viem";
import { db } from "../db/client";
import { clobCredentials } from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";

// Memoized promise — module-level singletons.
let _publicClient: PublicClient | undefined;
let _secureClientPromise: Promise<SecureClient> | undefined;

export function getPublicClient(): PublicClient {
  if (!_publicClient) {
    _publicClient = createPublicClient();
  }
  return _publicClient;
}

export function getSecureClient(): Promise<SecureClient> {
  if (!_secureClientPromise) {
    _secureClientPromise = initSecureClient();
  }
  return _secureClientPromise;
}

async function initSecureClient(): Promise<SecureClient> {
  const signer = privateKey(env.PRIVATE_KEY);
  const client = await createSecureClient({ signer });

  // Audit row: check once, insert if absent.
  const existing = await db.select().from(clobCredentials).limit(1);

  if (existing.length === 0) {
    // client.account.wallet is the active Polymarket deposit/proxy wallet.
    const proxyWallet: string = client.account.wallet;
    await db.insert(clobCredentials).values({
      apiKey: "managed-by-sdk",
      apiSecret: "managed-by-sdk",
      passphrase: "managed-by-sdk",
      proxyWallet,
    });
    logger.info("polymarket: initialized secure client, audit row written");
  } else {
    logger.info("polymarket: secure client ready, audit row already present");
  }

  return client;
}
