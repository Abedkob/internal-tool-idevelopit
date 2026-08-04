# idevelopit-vault Licensing API

The licensing API is served by the `license-api` Supabase Edge Function. Its database service credential and signing private key remain server-side.

## Deploy

1. Run `scripts/licensing-foundation.sql` in the Supabase SQL editor.
2. Run `node scripts/generate-license-signing-keys.mjs` locally. Do not commit the generated private JWK.
3. Store the three printed values as Supabase Edge Function secrets:

   ```bash
   supabase secrets set LICENSE_SIGNING_KEY_ID=idv-license-1
   supabase secrets set LICENSE_SIGNING_PRIVATE_JWK='<private JWK JSON>'
   supabase secrets set LICENSE_SIGNING_PUBLIC_JWK='<public JWK JSON>'
   supabase secrets set LICENSE_ALLOWED_ORIGINS='https://your-app.example'
   ```

4. Deploy with `supabase functions deploy license-api --no-verify-jwt`.
5. Run `scripts/licensing-verification.sql` and make one test activation.

Hosted Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function. Never place either the service role or private signing JWK in `NEXT_PUBLIC_*` variables.

## Base URL

```text
https://PROJECT_REF.supabase.co/functions/v1/license-api/v1
```

All POST bodies are JSON. Save the `activation_token` returned by activation and send it as `Authorization: Bearer TOKEN` for later calls. Generate and persist an installation UUID when the application first runs; do not use raw hardware identifiers.

## Activate

`POST /licenses/activate`

```json
{
  "license_key": "IDV-DESKTOP-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX",
  "product_code": "desktop-suite",
  "installation_id": "local-installation-uuid",
  "device_label": "Reception PC",
  "platform": "windows",
  "application_version": "1.0.0"
}
```

## Validate or heartbeat

`POST /licenses/validate` or `POST /licenses/heartbeat`

```json
{
  "installation_id": "local-installation-uuid",
  "application_version": "1.0.1"
}
```

The response rotates the activation token and returns `check_after` plus `offline_grace_until`. Applications should validate near `check_after`; they may continue offline only until the signed grace deadline.

## Deactivate

`POST /licenses/deactivate`

```json
{ "installation_id": "local-installation-uuid" }
```

Delete the local token only after the API confirms `ACTIVATION_DEACTIVATED`.

## Offline verification

Fetch `GET /v1/.well-known/jwks.json`, cache the ES256 public key by `kid`, and verify the token signature, issuer, audience, activation ID, and expiration locally. A client must never contain the private signing key.

## Stable errors

Clients should branch on `code`, not the human-readable `message`. Supported lifecycle codes include `LICENSE_INVALID`, `LICENSE_EXPIRED`, `LICENSE_SUSPENDED`, `LICENSE_REVOKED`, `PRODUCT_MISMATCH`, `ACTIVATION_LIMIT_REACHED`, `INSTALLATION_NOT_FOUND`, `TOKEN_INVALID`, and `RATE_LIMITED`.
