/**
 * Generates a valid RIFF/WAVE PCM buffer for testing with arbitrary bit depths,
 * channel counts, formats (PCM integer vs IEEE Float vs EXTENSIBLE), and metadata chunks.
 */
export function createWavBuffer(options: {
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
  durationSeconds?: number;
  frequency?: number;
  amplitude?: number;
  isFloat?: boolean;
  isExtensible?: boolean;
  extraPaddedBytesBeforeData?: number;
  waveformPattern?: 'sine' | 'step_quarters' | 'linear_ramp';
}): Buffer {
  const {
    sampleRate = 44100,
    channels = 2,
    bitDepth = 16,
    durationSeconds = 1,
    frequency = 440,
    amplitude = 0.8,
    isFloat = false,
    isExtensible = false,
    extraPaddedBytesBeforeData = 0,
    waveformPattern = 'sine'
  } = options;

  const totalFrames = Math.floor(sampleRate * durationSeconds);
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const dataByteLength = totalFrames * blockAlign;

  const fmtSubchunkSize = isExtensible ? 40 : 16;
  const junkChunkSize = extraPaddedBytesBeforeData > 0 ? 8 + extraPaddedBytesBeforeData : 0;
  const totalHeaderSize = 12 + (8 + fmtSubchunkSize) + junkChunkSize + 8;
  const totalFileSize = totalHeaderSize + dataByteLength;

  const buffer = Buffer.alloc(totalFileSize);

  // 1. RIFF Header
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(totalFileSize - 8, 4);
  buffer.write('WAVE', 8, 'ascii');

  let offset = 12;

  // 2. fmt chunk
  buffer.write('fmt ', offset, 'ascii');
  buffer.writeUInt32LE(fmtSubchunkSize, offset + 4);
  offset += 8;

  let formatTag = isFloat ? 3 : 1;
  if (isExtensible) {
    formatTag = 0xfffe;
  }

  buffer.writeUInt16LE(formatTag, offset);
  buffer.writeUInt16LE(channels, offset + 2);
  buffer.writeUInt32LE(sampleRate, offset + 4);
  buffer.writeUInt32LE(sampleRate * blockAlign, offset + 8); // byteRate
  buffer.writeUInt16LE(blockAlign, offset + 12);
  buffer.writeUInt16LE(bitDepth, offset + 14);
  offset += 16;

  if (isExtensible) {
    buffer.writeUInt16LE(22, offset); // cbSize
    buffer.writeUInt16LE(bitDepth, offset + 2); // wValidBitsPerSample
    buffer.writeUInt32LE(0x3f, offset + 4); // dwChannelMask (e.g. 5.1 / stereo)
    // GUID subformat prefix
    const guidPrefix = isFloat ? 0x00000003 : 0x00000001;
    buffer.writeUInt32LE(guidPrefix, offset + 8);
    buffer.writeUInt16LE(0x0000, offset + 12);
    buffer.writeUInt16LE(0x0010, offset + 14);
    buffer.write('800000aa00389b71', offset + 16, 'hex');
    offset += 24;
  }

  // 3. Optional extra JUNK/LIST metadata chunk before data to test arbitrary offset scanning
  if (extraPaddedBytesBeforeData > 0) {
    buffer.write('JUNK', offset, 'ascii');
    buffer.writeUInt32LE(extraPaddedBytesBeforeData, offset + 4);
    offset += 8;
    // Fill padding with test bytes
    buffer.fill(0x55, offset, offset + extraPaddedBytesBeforeData);
    offset += extraPaddedBytesBeforeData;
  }

  // 4. data chunk
  buffer.write('data', offset, 'ascii');
  buffer.writeUInt32LE(dataByteLength, offset + 4);
  offset += 8;

  // 5. PCM Samples
  for (let f = 0; f < totalFrames; f++) {
    let sampleValue = 0;
    if (waveformPattern === 'sine') {
      const t = f / sampleRate;
      sampleValue = amplitude * Math.sin(2 * Math.PI * frequency * t);
    } else if (waveformPattern === 'step_quarters') {
      const quarter = Math.floor((f * 4) / totalFrames);
      if (quarter === 0) sampleValue = 0.25;
      else if (quarter === 1) sampleValue = 0.5;
      else if (quarter === 2) sampleValue = 0.75;
      else sampleValue = 1.0;
    } else if (waveformPattern === 'linear_ramp') {
      sampleValue = (f / totalFrames) * amplitude;
    }

    for (let ch = 0; ch < channels; ch++) {
      if (isFloat && bitDepth === 32) {
        buffer.writeFloatLE(sampleValue, offset);
        offset += 4;
      } else if (!isFloat && bitDepth === 32) {
        const int32 = Math.max(-2147483648, Math.min(2147483647, Math.floor(sampleValue * 2147483647)));
        buffer.writeInt32LE(int32, offset);
        offset += 4;
      } else if (bitDepth === 24) {
        const int24 = Math.max(-8388608, Math.min(8388607, Math.floor(sampleValue * 8388607)));
        buffer.writeUInt8(int24 & 0xff, offset);
        buffer.writeUInt8((int24 >> 8) & 0xff, offset + 1);
        buffer.writeUInt8((int24 >> 16) & 0xff, offset + 2);
        offset += 3;
      } else if (bitDepth === 16) {
        const int16 = Math.max(-32768, Math.min(32767, Math.floor(sampleValue * 32767)));
        buffer.writeInt16LE(int16, offset);
        offset += 2;
      } else if (bitDepth === 8) {
        const uint8 = Math.max(0, Math.min(255, Math.floor((sampleValue + 1) * 127.5)));
        buffer.writeUInt8(uint8, offset);
        offset += 1;
      }
    }
  }

  return buffer;
}
