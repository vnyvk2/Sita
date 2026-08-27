/**
 * Generates a valid RIFF/WAVE PCM buffer for testing.
 */
export function createWavBuffer(options: {
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
  durationSeconds?: number;
  frequency?: number;
  amplitude?: number;
  isFloat?: boolean;
}): Buffer {
  const {
    sampleRate = 44100,
    channels = 2,
    bitDepth = 16,
    durationSeconds = 1,
    frequency = 440,
    amplitude = 0.8,
    isFloat = false
  } = options;

  const totalFrames = Math.floor(sampleRate * durationSeconds);
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const dataByteLength = totalFrames * blockAlign;

  const buffer = Buffer.alloc(44 + dataByteLength);

  // RIFF header
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write('WAVE', 8, 'ascii');

  // fmt chunk
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // subchunk1 size
  buffer.writeUInt16LE(isFloat ? 3 : 1, 20); // 1 = PCM, 3 = IEEE Float
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28); // byteRate
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);

  // data chunk
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataByteLength, 40);

  let offset = 44;
  for (let f = 0; f < totalFrames; f++) {
    const t = f / sampleRate;
    // Generate sine wave sample
    const sampleValue = amplitude * Math.sin(2 * Math.PI * frequency * t);

    for (let ch = 0; ch < channels; ch++) {
      if (isFloat && bitDepth === 32) {
        buffer.writeFloatLE(sampleValue, offset);
        offset += 4;
      } else if (bitDepth === 16) {
        const int16 = Math.max(-32768, Math.min(32767, Math.floor(sampleValue * 32767)));
        buffer.writeInt16LE(int16, offset);
        offset += 2;
      } else if (bitDepth === 24) {
        const int24 = Math.max(-8388608, Math.min(8388607, Math.floor(sampleValue * 8388607)));
        buffer.writeUInt8(int24 & 0xff, offset);
        buffer.writeUInt8((int24 >> 8) & 0xff, offset + 1);
        buffer.writeUInt8((int24 >> 16) & 0xff, offset + 2);
        offset += 3;
      } else if (bitDepth === 8) {
        const uint8 = Math.max(0, Math.min(255, Math.floor((sampleValue + 1) * 127.5)));
        buffer.writeUInt8(uint8, offset);
        offset += 1;
      }
    }
  }

  return buffer;
}
