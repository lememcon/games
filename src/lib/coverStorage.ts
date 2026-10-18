import { ApiError } from "@/lib/api";
import { ADMIN_LOST, GENERIC_ERROR, isAuthError } from "@/lib/apiErrors";
import type {
  CoverStorageInfo,
  CoverStorageInput,
  CoverStorageSource,
} from "@/types";

export interface StorageForm {
  bucket: string;
  region: string;
  endpoint: string;
  coverBaseUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// The saved key id and secret are never sent back, so those start blank.
export const toForm = (info: CoverStorageInfo): StorageForm => ({
  bucket: info.bucket ?? "",
  region: info.region ?? "",
  endpoint: info.endpoint ?? "",
  coverBaseUrl: info.coverBaseUrl ?? "",
  accessKeyId: "",
  secretAccessKey: "",
});

// A blank endpoint or secret is left out: no endpoint means AWS, no secret
// reuses the saved one.
export const toInput = (form: StorageForm): CoverStorageInput => {
  const endpoint = form.endpoint.trim();
  const secret = form.secretAccessKey.trim();
  return {
    bucket: form.bucket.trim(),
    region: form.region.trim(),
    ...(endpoint ? { endpoint } : {}),
    coverBaseUrl: form.coverBaseUrl.trim(),
    accessKeyId: form.accessKeyId.trim(),
    ...(secret ? { secretAccessKey: secret } : {}),
  };
};

export const isEdited = (form: StorageForm, saved: StorageForm): boolean =>
  (Object.keys(form) as (keyof StorageForm)[]).some(
    (k) => form[k].trim() !== saved[k].trim(),
  );

// Everything the server requires; endpoint and secret are optional.
export const isComplete = (form: StorageForm): boolean =>
  [form.bucket, form.region, form.coverBaseUrl, form.accessKeyId].every(
    (v) => v.trim() !== "",
  );

const SOURCE_LABELS: Record<CoverStorageSource, string> = {
  admin: "Saved here",
  env: "Server environment",
  none: "Not set",
};

export const sourceLabel = (source: CoverStorageSource): string =>
  SOURCE_LABELS[source];

const FIELD_LABELS: Record<string, string> = {
  bucket: "bucket name",
  region: "region",
  endpoint: "endpoint",
  coverBaseUrl: "cover base URL",
  accessKeyId: "access key id",
  secretAccessKey: "secret access key",
};

// Maps an API failure to a message for the admin. Server messages are never
// shown verbatim, and no submitted value is echoed.
export const describeStorageError = (e: unknown): string => {
  if (!(e instanceof ApiError)) return GENERIC_ERROR;
  if (isAuthError(e)) return ADMIN_LOST;
  if (e.status === 429) return "Wait a few seconds before testing again.";
  if (e.status === 409)
    return "A cover test is already running. Try again shortly.";
  if (e.status === 400 && e.message === "invalid_storage") {
    const { field, code } = (e.body ?? {}) as { field?: string; code?: string };
    if (code === "secret_required")
      return "Enter the secret access key: it can only be reused when the endpoint, region and access key id are unchanged.";
    if (field && FIELD_LABELS[field])
      return `The ${FIELD_LABELS[field]} isn't valid.`;
  }
  if (e.status === 400) return "The request was rejected.";
  return GENERIC_ERROR;
};
