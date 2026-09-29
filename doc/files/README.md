# Catalog asset uploads

Seller profile images and product images/models upload directly from the browser to the assets bucket. The API issues a short-lived signed POST policy; it does not receive the file body.

## Request

`POST /files/upload-url` requires a vendor JWT and accepts:

```json
{
  "purpose": "product_image",
  "contentType": "image/jpeg",
  "fileSize": 1048576
}
```

Purposes and declared-size limits:

| Purpose | Types | Limit | Key prefix |
| --- | --- | ---: | --- |
| `profile_image` | JPEG, PNG, WebP | 5 MiB | `users/{userId}/` |
| `product_image` | JPEG, PNG, WebP | 5 MiB | `products/{userId}/` |
| `product_model` | GLB, glTF, USDZ | 50 MiB | `products/{userId}/` |

The API derives `userId` from the JWT and generates `pending/{purpose}/{userId}/{uuid}.{extension}`. The response is `{ "url": "...", "fields": { ... }, "key": "..." }`. The signed policy fixes the bucket, key, content type, maximum object size, and expiry. The browser posts a `multipart/form-data` request to `url`, including every returned field and the file as the final field.

After Cloud Storage accepts the form, the browser calls `POST /files/finalize` with `{ "key": "pending/..." }`. The API checks the temporary object's owner, purpose, actual size, content type, generation, and file signature in Cloud Storage. It then copies that exact generation to `products/{userId}/...` or `users/{userId}/...`, deletes the temporary generation, and returns `{ "key": "...", "url": "..." }`. The signed policy cannot overwrite the final object. The bucket lifecycle deletes abandoned `pending/` objects after one day.

Product create, product update/asset write, and vendor profile update verify newly attached public asset URLs against the authenticated seller and Cloud Storage metadata. Existing unchanged assets remain editable. Registration does not accept a profile logo; it must be uploaded after signing in.

`DELETE /files/:key` is available to the owning vendor for unattached draft files. The key must be URL encoded in the path. The API rejects deletion when the public URL is referenced by a product asset or vendor profile.

The legacy multipart upload, generic read-signed-URL endpoint, and local `/uploads/` route were removed because the current frontend uses none of them. Virtual-staging media uses its separate private bucket and upload endpoint.

## Current boundary

The API checks the file's initial bytes against its declared format; this is a signature check, not a complete decoder or malware scan. Existing asset URLs accepted before this flow are preserved only when left unchanged. The signed POST policy and new bucket CORS/lifecycle configuration must be deployed together with the frontend/backend changes. Virtual-staging uploads continue to use their separate private flow.
