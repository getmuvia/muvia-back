# Virtual Staging

System for virtual room decoration that analyzes empty rooms, searches for real products from the marketplace, and generates photorealistic images with those products.

---

## Business Goal

Convert visualization into real sales: the user uploads a photo of their empty room and receives a decorated image with products they **can purchase directly** from the catalog.

---

## Architecture

### Ports & Adapters Pattern (Hexagonal)

The system is designed to be **AI provider-agnostic**. Business logic doesn't know about Google, OpenAI, or any specific SDK.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION LAYER                                 │
│                                                                             │
│  VirtualStagingController                                                   │
│  └── POST /ai/virtual-staging                                               │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                           ORCHESTRATION LAYER                               │
│                                                                             │
│  VirtualStagingService (Provider-Agnostic)                                  │
│  ├── Analyze image (via IVisionProvider)                                    │
│  ├── Search products (via SearchService - Hybrid Search)                    │
│  └── Generate image (via IImageGenerator)                                   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                              PORTS (Interfaces)                             │
│                                                                             │
│  IVisionProvider          │  IImageGenerator                                │
│  └── analyzeRoom()        │  └── generate()                                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                         ADAPTERS (Implementations)                          │
│                                                                             │
│  providers/google/                                                          │
│  ├── GeminiVisionProvider    (implements IVisionProvider)                   │
│  └── Imagen3Provider         (implements IImageGenerator)                   │
│                                                                             │
│  providers/openai/ (future)                                                 │
│  ├── GPT4VisionProvider                                                     │
│  └── DallEProvider                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Switching AI Provider

To switch from Google to OpenAI, only modify `ai.module.ts`:

```typescript
// Before (Google)
{
    provide: VISION_PROVIDER,
    useClass: GeminiVisionProvider,
}

// After (OpenAI)
{
    provide: VISION_PROVIDER,
    useClass: GPT4VisionProvider,
}
```

**The orchestrator service is NOT modified.**

---

## Endpoint Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│  POST /ai/virtual-staging                                                │
│  Body: { imageKey: "staging/123.jpg", preferredStyle: "modern" }         │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  1️⃣ IMAGE ANALYSIS (IVisionProvider)                                     │
│                                                                          │
│  Input: Empty room image                                                 │
│  Output: RoomAnalysisResult                                              │
│  ├── roomType: "living room"                                             │
│  ├── style: "modern"                                                     │
│  ├── emptyAreas: ["center", "left corner", "near window"]                │
│  ├── suggestedFurniture: ["3-seater sofa", "coffee table", "floor lamp"] │
│  └── colorPalette: ["beige", "warm gray", "oak wood"]                    │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  2️⃣ PRODUCT SEARCH (Hybrid Search)                                       │
│                                                                          │
│  Generated queries:                                                      │
│  ├── "3-seater sofa modern beige"                                        │
│  ├── "coffee table modern beige"                                         │
│  └── "floor lamp modern beige"                                           │
│                                                                          │
│  Result: REAL products from catalog ranked by relevance                  │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  3️⃣ IMAGE GENERATION (IImageGenerator)                                   │
│                                                                          │
│  Input: Original image + Prompt with real products                       │
│  Output: Photorealistic decorated image URL                              │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  RESPONSE                                                                │
│  {                                                                       │
│    analysis: { roomType, style, suggestedFurniture, ... },               │
│    suggestedProducts: [{ id, title, price, imageUrl, score }, ...],      │
│    stagedImageUrl: "https://storage.../staged-room.jpg",                 │
│    metadata: { processingTimeMs: 3200, productsFound: 8 }                │
│  }                                                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Image Resolution Strategy

The system supports two image sources with **automatic fallback**:

### Priorities

| Priority | Parameter | Description | Performance |
|----------|-----------|-------------|-------------|
| 1 | `imageKey` | Internal GCS path (e.g., `staging/temp/123.jpg`) | ⚡ 0 bytes in backend |
| 2 | `imageUrl` | External URL (e.g., `https://example.com/room.jpg`) | 🐢 Requires download |

### Flow with Fallback

```
imageKey present?
├─ Yes → Try with gs://bucket/key
│        ├─ ✅ Success → Continue with flow
│        └─ ❌ Fails → imageUrl exists?
│                      ├─ Yes → Try with URL (fallback)
│                      │        ├─ ✅ Success → Continue
│                      │        └─ ❌ Fails → Error
│                      └─ No → Propagate original error
└─ No → imageUrl exists?
        ├─ Yes → Try with URL
        └─ No → Error 400: "Either imageKey or imageUrl must be provided"
```

### Why Fallback Exists

1. **Resilience:** If GCS has temporary issues, the system doesn't fail completely
2. **Flexibility:** Frontend can send both as a "safety net"
3. **Debugging:** Allows testing with external URLs without uploading to GCS

### Resolution in Provider (Google)

```typescript
// imageKey → Native reference (maximum performance)
if (input.key) {
    const gsUri = `gs://${bucket}/${input.key}`;
    return { fileData: { fileUri: gsUri, mimeType } };
}

// imageUrl → Download and encode
if (input.url) {
    const { buffer, mimeType } = await this.downloadImage(input.url);
    return { inlineData: { mimeType, data: buffer.toString('base64') } };
}
```

---

## API Reference

### Endpoint

```http
POST /ai/virtual-staging
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Request Body

```typescript
{
    // OPTION 1: Image in GCS (recommended)
    "imageKey": "virtual-staging/temp/abc123.jpg",
    
    // OPTION 2: External URL
    "imageUrl": "https://example.com/room.jpg",
    
    // Optional
    "preferredStyle": "modern",  // Override detected style
    "maxProducts": 10            // Product limit (1-20, default: 10)
}
```

### Validation

| Field | Rule |
|-------|------|
| `imageKey` / `imageUrl` | At least one required |
| `preferredStyle` | Enum: `modern`, `minimalist`, `rustic`, `industrial`, `scandinavian`, `bohemian`, `traditional` |
| `maxProducts` | Number between 1 and 20 |

### Response

```typescript
{
    "analysis": {
        "roomType": "living room",
        "style": "modern",
        "emptyAreas": ["center", "left corner", "near window"],
        "suggestedFurniture": ["3-seater sofa", "coffee table", "floor lamp"],
        "colorPalette": ["beige", "warm gray", "oak wood"],
        "dimensions": {
            "width": "medium",
            "depth": "spacious"
        }
    },
    "suggestedProducts": [
        {
            "id": "uuid",
            "title": "Modern Gray 3-Seater Sofa",
            "description": "Contemporary sofa...",
            "price": 899.99,
            "imageUrl": "https://storage.../sofa.jpg",
            "score": 0.92,
            "matchType": "hybrid"
        }
        // ... more products
    ],
    "stagedImageUrl": "https://storage.../staged/result-uuid.jpg",
    "metadata": {
        "processingTimeMs": 3200,
        "productsFound": 8
    }
}
```

---

## File Structure

```
src/modules/ai/
├── controllers/
│   └── virtual-staging.controller.ts    # POST /ai/virtual-staging
│
├── services/
│   └── virtual-staging/
│       └── virtual-staging.service.ts   # Orchestrator (provider-agnostic)
│
├── interfaces/
│   ├── vision-provider.interface.ts     # Port: IVisionProvider
│   └── image-generator.interface.ts     # Port: IImageGenerator
│
├── providers/
│   └── google/
│       ├── gemini-vision.provider.ts    # Adapter: Gemini Vision
│       └── imagen3.provider.ts          # Adapter: Imagen 3
│
├── dto/
│   └── virtual-staging.dto.ts           # Request/Response DTOs
│
└── ai.module.ts                         # Dependency wiring
```

---

## Contracts (Ports)

### IVisionProvider

```typescript
interface IVisionProvider {
    analyzeRoom(input: ImageSourceInput): Promise<RoomAnalysisResult>;
}

interface ImageSourceInput {
    key?: string;  // Internal GCS path
    url?: string;  // External URL
}

interface RoomAnalysisResult {
    roomType: string;
    style: string;
    emptyAreas: string[];
    suggestedFurniture: string[];
    colorPalette: string[];
    dimensions?: { width: 'small' | 'medium' | 'large'; depth: 'compact' | 'spacious' };
}
```

### IImageGenerator

```typescript
interface IImageGenerator {
    generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

interface ImageGenerationRequest {
    imageSource: ImageSourceInput;
    prompt: string;
    negativePrompt?: string;
    style?: 'photorealistic' | 'artistic' | 'sketch';
}

interface ImageGenerationResult {
    imageUrl: string;
    imageBuffer?: Buffer;
    metadata?: { model: string; generationTimeMs: number };
}
```

---

## Usage Example (Frontend)

### Recommended Flow

```typescript
// 1. Get signed URL to upload image
const { url, key } = await fetch('/files/upload-url', {
    method: 'POST',
    body: JSON.stringify({ 
        filename: 'room.jpg', 
        contentType: 'image/jpeg' 
    })
}).then(r => r.json());

// 2. Upload image directly to GCS
await fetch(url, {
    method: 'PUT',
    body: imageFile,
    headers: { 'Content-Type': 'image/jpeg' }
});

// 3. Request staging with the key
const result = await fetch('/ai/virtual-staging', {
    method: 'POST',
    body: JSON.stringify({
        imageKey: key,
        preferredStyle: 'modern',
        maxProducts: 10
    })
}).then(r => r.json());

// 4. Display result
console.log(result.stagedImageUrl);      // Decorated image
console.log(result.suggestedProducts);   // Products to purchase
```

### With External URL (Testing)

```typescript
const result = await fetch('/ai/virtual-staging', {
    method: 'POST',
    body: JSON.stringify({
        imageUrl: 'https://example.com/my-room.jpg'
    })
}).then(r => r.json());
```

---

## Required Configuration

### Environment Variables

```env
# Google Cloud Platform
GCP_PROJECT_ID=my-project-id
GCP_LOCATION=us-central1

# Google Cloud Storage
GOOGLE_STORAGE_BUCKET=my-bucket-name
```

### GCP Permissions

The service account must have:
- `roles/aiplatform.user` (Vertex AI)
- `roles/storage.objectViewer` (read images from GCS)
- `roles/storage.objectCreator` (save generated images)

---

## Future Implementations

### Adding a New Vision Provider

1. Create `providers/openai/gpt4-vision.provider.ts`
2. Implement `IVisionProvider` interface
3. Change `useClass` in `ai.module.ts`

```typescript
// providers/openai/gpt4-vision.provider.ts
@Injectable()
export class GPT4VisionProvider implements IVisionProvider {
    async analyzeRoom(input: ImageSourceInput): Promise<RoomAnalysisResult> {
        // Implementation with OpenAI API
    }
}
```

### Adding a New Image Generator

1. Create `providers/openai/dalle.provider.ts`
2. Implement `IImageGenerator` interface
3. Change `useClass` in `ai.module.ts`

---

## Technical Notes

### Why Image is Not Received as File (Multipart)

1. **Efficiency:** Frontend already uploads to GCS via signed URL
2. **Memory:** Avoids loading large images into backend memory
3. **Performance:** With `imageKey`, Gemini reads directly from GCS (0 bytes in backend)

### Current Limitations

- **Imagen 3:** Image generation is a placeholder. Requires additional billing configuration in Google Cloud.
- **Fallback:** Fallback increases latency if the first attempt fails.
