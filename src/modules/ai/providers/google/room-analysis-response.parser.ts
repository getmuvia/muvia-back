import { RoomAnalysisResult } from '../../interfaces/vision-provider.interface';

const WIDTH_VALUES = ['small', 'medium', 'large'] as const;
const DEPTH_VALUES = ['compact', 'spacious'] as const;

type JsonObject = Record<string, unknown>;

export class InvalidRoomAnalysisResponseError extends Error {
  constructor() {
    super('Invalid response format from vision model');
    this.name = InvalidRoomAnalysisResponseError.name;
  }
}

export function parseRoomAnalysisResponse(text: string): RoomAnalysisResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InvalidRoomAnalysisResponseError();
  }

  if (!isJsonObject(parsed)) {
    throw new InvalidRoomAnalysisResponseError();
  }

  const roomType = readRequiredString(parsed, 'roomType');
  const style = readRequiredString(parsed, 'style');
  const emptyAreas = readRequiredStringArray(parsed, 'emptyAreas');
  const suggestedFurniture = readRequiredStringArray(
    parsed,
    'suggestedFurniture',
  );
  const colorPalette = readRequiredStringArray(parsed, 'colorPalette');
  const dimensions = readOptionalDimensions(parsed.dimensions);

  return {
    roomType,
    style,
    emptyAreas,
    suggestedFurniture,
    colorPalette,
    ...(dimensions ? { dimensions } : {}),
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(source: JsonObject, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidRoomAnalysisResponseError();
  }
  return value;
}

function readRequiredStringArray(source: JsonObject, key: string): string[] {
  const value = source[key];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.trim().length === 0)
  ) {
    throw new InvalidRoomAnalysisResponseError();
  }
  return value;
}

function readOptionalDimensions(
  value: unknown,
): RoomAnalysisResult['dimensions'] {
  if (value === undefined) {
    return undefined;
  }

  if (
    !isJsonObject(value) ||
    !isOneOf(value.width, WIDTH_VALUES) ||
    !isOneOf(value.depth, DEPTH_VALUES)
  ) {
    throw new InvalidRoomAnalysisResponseError();
  }

  return {
    width: value.width,
    depth: value.depth,
  };
}

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}
