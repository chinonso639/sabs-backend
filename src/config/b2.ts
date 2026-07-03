import { S3Client } from "@aws-sdk/client-s3";

// Backblaze cluster prefix → S3 region mapping
const CLUSTER_REGIONS: Record<string, string> = {
  f001: "us-west-001",
  f002: "us-west-002",
  f003: "eu-central-003",
  f004: "us-west-004",
  f005: "us-east-005",
  f006: "us-west-006",
};

let _client: S3Client | null = null;
let _bucket = "";
let _publicUrlBase = "";

export function getB2Client(): S3Client {
  if (!_client) throw new Error("B2 not initialized — call initB2() first.");
  return _client;
}
export const getB2Bucket = () => _bucket;
export const getB2PublicUrlBase = () => _publicUrlBase;

/**
 * Authorizes with Backblaze, auto-derives endpoint/region/public URL, and
 * ensures the bucket is set to public so uploaded images are directly accessible.
 * Only requires: B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME, B2_BUCKET_ID
 */
export async function initB2(): Promise<void> {
  const keyId = process.env.B2_KEY_ID ?? "";
  const appKey = process.env.B2_APP_KEY ?? "";
  const bucketId = process.env.B2_BUCKET_ID ?? "";
  _bucket = process.env.B2_BUCKET_NAME ?? "";

  if (!keyId || !appKey || !_bucket) {
    console.warn("⚠️  B2 credentials not set — uploads will fail.");
    return;
  }

  const basicCreds = Buffer.from(`${keyId}:${appKey}`).toString("base64");

  // Step 1: Authorize to get API URL, download URL, account ID, and token
  const authRes = await fetch(
    "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
    { headers: { Authorization: `Basic ${basicCreds}` } },
  );

  if (!authRes.ok) {
    const body = await authRes.text();
    throw new Error(`B2 authorization failed: ${authRes.status} ${body}`);
  }

  const auth = (await authRes.json()) as {
    accountId?: string;
    authorizationToken?: string;
    apiUrl?: string;
    downloadUrl?: string;
    apiInfo?: { storageApi?: { apiUrl?: string; downloadUrl?: string } };
  };

  const downloadUrl = auth.downloadUrl ?? auth.apiInfo?.storageApi?.downloadUrl;
  const apiUrl =
    auth.apiUrl ??
    auth.apiInfo?.storageApi?.apiUrl ??
    "https://api.backblazeb2.com";
  const accountId = auth.accountId;
  const authToken = auth.authorizationToken;

  if (!downloadUrl) {
    throw new Error(
      "B2 authorize response missing downloadUrl. Check credentials.",
    );
  }

  // Step 2: Make the bucket public so images are accessible without auth
  if (bucketId && accountId && authToken) {
    const updateRes = await fetch(`${apiUrl}/b2api/v2/b2_update_bucket`, {
      method: "POST",
      headers: {
        Authorization: authToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accountId,
        bucketId,
        bucketType: "allPublic",
      }),
    });
    if (!updateRes.ok) {
      const err = await updateRes.text();
      console.warn(`⚠️  Could not set bucket to public: ${err}`);
    } else {
      console.log(`✅ B2 bucket set to public`);
    }
  }

  // Step 3: Derive S3-compatible endpoint from cluster prefix in download URL
  const match = downloadUrl.match(/https:\/\/(f\d+)\.backblazeb2\.com/);
  const cluster = match?.[1] ?? "f004";
  const region = CLUSTER_REGIONS[cluster] ?? "us-west-004";

  _publicUrlBase = `${downloadUrl}/file/${_bucket}`;
  _client = new S3Client({
    endpoint: `https://s3.${region}.backblazeb2.com`,
    region,
    credentials: { accessKeyId: keyId, secretAccessKey: appKey },
    forcePathStyle: true,
  });

  console.log(
    `✅ B2 connected: ${cluster} → ${region} | bucket: ${_bucket} (public)`,
  );
}
