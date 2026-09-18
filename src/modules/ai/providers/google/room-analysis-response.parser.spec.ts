import {
  InvalidRoomAnalysisResponseError,
  parseRoomAnalysisResponse,
} from './room-analysis-response.parser';

const validResponse = {
  roomType: 'living room',
  style: 'modern',
  emptyAreas: ['center', 'near window'],
  suggestedFurniture: ['3-seater sofa', 'floor lamp'],
  colorPalette: ['beige', 'oak wood'],
  dimensions: {
    width: 'large',
    depth: 'spacious',
  },
};

describe('parseRoomAnalysisResponse', () => {
  it('maps a valid structured response', () => {
    expect(parseRoomAnalysisResponse(JSON.stringify(validResponse))).toEqual(
      validResponse,
    );
  });

  it('accepts a valid response without optional dimensions', () => {
    const { dimensions: _dimensions, ...responseWithoutDimensions } =
      validResponse;

    expect(
      parseRoomAnalysisResponse(JSON.stringify(responseWithoutDimensions)),
    ).toEqual(responseWithoutDimensions);
  });

  it.each([
    ['malformed JSON', '{"roomType":'],
    [
      'markdown-wrapped JSON',
      `\`\`\`json\n${JSON.stringify(validResponse)}\n\`\`\``,
    ],
    [
      'missing required property',
      JSON.stringify({ ...validResponse, roomType: undefined }),
    ],
    [
      'invalid array item',
      JSON.stringify({ ...validResponse, emptyAreas: ['center', 42] }),
    ],
    [
      'invalid dimension enum',
      JSON.stringify({
        ...validResponse,
        dimensions: { width: 'extra-large', depth: 'spacious' },
      }),
    ],
  ])('rejects %s with a controlled error', (_caseName, response) => {
    expect(() => parseRoomAnalysisResponse(response)).toThrow(
      InvalidRoomAnalysisResponseError,
    );
    expect(() => parseRoomAnalysisResponse(response)).toThrow(
      'Invalid response format from vision model',
    );
  });
});
