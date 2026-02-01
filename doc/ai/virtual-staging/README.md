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
│  IVisionProvider          │  IImageGenerator        │  IEmbeddingProvider   │
│  └── analyzeRoom()        │  └── generate()         │  └── generateEmbedding│
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                         ADAPTERS (Implementations)                          │
│                                                                             │
│  providers/google/                                                          │
│  ├── Gemini3VisionProvider   (implements IVisionProvider)                   │
│  ├── GeminiImageProvider     (implements IImageGenerator)                   │
│  └── VertexEmbeddingProvider (implements IEmbeddingProvider)                │
│                                                                             │
│  providers/helpers/                                                         │
│  ├── image-dimension.helper.ts  (PNG/JPEG/WebP parsing + EXIF)              │
│  └── aspect-ratio.helper.ts     (Ratio mapping utilities)                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | SDK | Purpose |
|-----------|-----|---------|
| **Vision Analysis** | `@google/genai` | Room analysis with Gemini 3 |
| **Image Generation** | `@google/genai` | Virtual staging with Gemini 3 |
| **Embeddings** | `@google-cloud/aiplatform` | Product vector embeddings |
| **Storage** | `@google-cloud/storage` | GCS for images |

### Switching AI Provider

To switch from Google to OpenAI, only modify `ai.module.ts`:

```typescript
// Before (Google)
{
    provide: VISION_PROVIDER,
    useClass: Gemini3VisionProvider,
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
│  1️⃣ IMAGE ANALYSIS (Gemini3VisionProvider)                              │
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
│  2️⃣ PRODUCT SEARCH (Hybrid Search + VertexEmbeddingProvider)            │
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
│  3️⃣ IMAGE GENERATION (GeminiImageProvider)                              │
│                                                                          │
│  Features:                                                               │
│  ├── Auto-detects source image aspect ratio (PNG/JPEG/WebP)              │
│  ├── Handles EXIF orientation for mobile photos                          │
│  ├── Uses product images as visual references                            │
│  └── Preserves architectural elements (walls, windows, floor)            │
│                                                                          │
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

## File Structure

```
src/modules/ai/
├── controllers/
│   └── virtual-staging.controller.ts
│
├── services/
│   └── virtual-staging/
│       └── virtual-staging.service.ts
│
├── interfaces/
│   ├── vision-provider.interface.ts
│   ├── image-generator.interface.ts
│   └── embedding-provider.interface.ts
│
├── providers/
│   ├── google/
│   │   ├── gemini3-vision.provider.ts
│   │   ├── gemini-image.provider.ts
│   │   ├── vertex-embedding.provider.ts
│   │   └── index.ts
│   └── helpers/
│       ├── image-dimension.helper.ts
│       ├── aspect-ratio.helper.ts
│       └── index.ts
│
├── prompts/
│   └── templates/
│       ├── room-analysis.prompt.ts
│       └── staging-generation.prompt.ts
│
├── core/
│   ├── retry/
│   └── image-resolver/
│
├── dto/
│   └── virtual-staging.dto.ts
│
└── ai.module.ts
```

---

## Required Configuration

### Environment Variables

```env
# Google Cloud Platform
GCP_PROJECT_ID=my-project-id

# Vision & Image Generation (Gemini 3)
GCP_LOCATION=global
GCP_GEMINI_MODEL=gemini-3-pro-preview

# Image Generation (specific)
GCP_IMAGEN_LOCATION=global
GCP_IMAGEN_MODEL=gemini-3-pro-image-preview

# Embeddings (Vertex AI)
GCP_EMBEDDING_LOCATION=us-central1
GCP_EMBEDDING_MODEL=text-embedding-004

# Google Cloud Storage
GOOGLE_STORAGE_BUCKET=my-bucket-name
```

> **Note:** Embedding models do NOT support the 'global' endpoint. Use regional endpoints like `us-central1`.

### GCP Permissions

The service account must have:
- `roles/aiplatform.user` (Vertex AI)
- `roles/storage.objectViewer` (read images from GCS)
- `roles/storage.objectCreator` (save generated images)

---

## Contracts (Ports)

### IVisionProvider

```typescript
interface IVisionProvider {
    analyzeRoom(input: ImageSourceInput): Promise<RoomAnalysisResult>;
}

interface ImageSourceInput {
    key?: string;
    url?: string;
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
    referenceImages?: string[];
    style?: 'photorealistic' | 'artistic' | 'sketch';
    aspectRatio?: string;
}

interface ImageGenerationResult {
    imageUrl: string;
    metadata?: { model: string; generationTimeMs: number };
}
```

### IEmbeddingProvider

```typescript
interface IEmbeddingProvider {
    generateEmbedding(text: string, taskType?: EmbeddingTaskType): Promise<EmbeddingResult>;
    isAvailable(): boolean;
}

type EmbeddingTaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY';

interface EmbeddingResult {
    embedding: number[];
    dimensions: number;
}
```

---

## Image Generation Features

### Aspect Ratio Detection

The system automatically detects the source image aspect ratio:

1. Reads image buffer from GCS or URL
2. Parses dimensions from PNG/JPEG/WebP headers
3. Handles EXIF orientation for mobile photos (rotation swap)
4. Maps to closest supported ratio: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9`, `5:4`, `4:5`

### Architectural Preservation

The staging prompt explicitly instructs the AI to preserve:
- Wall positions, angles, and colors
- Ceiling height, shape, and angle
- Floor material and pattern
- Window and door positions
- Camera perspective and vanishing points
- Natural light direction and shadows

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
    "imageKey": "virtual-staging/temp/abc123.jpg",
    "imageUrl": "https://example.com/room.jpg",
    "preferredStyle": "modern",
    "maxProducts": 10
}
```

### Response

```typescript
{
    "analysis": {
        "roomType": "living room",
        "style": "modern",
        "emptyAreas": ["center", "left corner"],
        "suggestedFurniture": ["3-seater sofa", "coffee table"],
        "colorPalette": ["beige", "warm gray"]
    },
    "suggestedProducts": [
        {
            "id": "uuid",
            "title": "Modern Gray 3-Seater Sofa",
            "price": 899.99,
            "imageUrl": "https://storage.../sofa.jpg",
            "score": 0.92
        }
    ],
    "stagedImageUrl": "https://storage.../staged/result-uuid.jpg",
    "metadata": {
        "processingTimeMs": 3200,
        "productsFound": 8
    }
}
```
