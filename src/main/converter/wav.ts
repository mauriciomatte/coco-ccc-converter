// No Node imports needed for pure FSK DSP audio decoding in the browser

export interface WavMetadata {
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
  dataSize: number;
}

export interface DecodedWav {
  metadata: WavMetadata;
  bytes: Buffer;
  isInverted: boolean;
  syncBitIndex: number;
}

/**
 * Decodes a TRS-80 Color Computer FSK WAV audio file into its raw byte stream.
 */
export function decodeWav(wavBuffer: Buffer): DecodedWav {
  // Parse WAV header
  let offset = 12; // Skip 'RIFF', size, 'WAVE'
  let sampleRate = 0;
  let bitsPerSample = 0;
  let channels = 0;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset < wavBuffer.length) {
    if (offset + 8 > wavBuffer.length) break;
    const chunkId = wavBuffer.slice(offset, offset + 4).toString('ascii');
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ') {
      channels = wavBuffer.readUInt16LE(offset + 8 + 2);
      sampleRate = wavBuffer.readUInt32LE(offset + 8 + 4);
      bitsPerSample = wavBuffer.readUInt16LE(offset + 8 + 14);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize;
  }

  if (sampleRate === 0 || bitsPerSample === 0 || channels === 0 || dataOffset === 0) {
    throw new Error('Invalid or unsupported WAV format.');
  }

  const pcm = wavBuffer.slice(dataOffset, dataOffset + dataSize);
  const samples: number[] = [];

  if (bitsPerSample === 8) {
    for (let i = 0; i < pcm.length; i += channels) {
      samples.push((pcm[i] - 128) / 128.0);
    }
  } else if (bitsPerSample === 16) {
    for (let i = 0; i < pcm.length; i += 2 * channels) {
      if (i + 1 < pcm.length) {
        samples.push(pcm.readInt16LE(i) / 32768.0);
      }
    }
  } else {
    throw new Error(`Unsupported bits per sample: ${bitsPerSample}`);
  }

  if (samples.length === 0) {
    throw new Error('No audio samples found in WAV file.');
  }

  // Zero-crossing detection (up-crossings only)
  const upCrossings: number[] = [];
  let prevSign = Math.sign(samples[0]) || 1;

  for (let i = 1; i < samples.length; i++) {
    const sign = Math.sign(samples[i]) || 1;
    if (sign !== prevSign) {
      if (sign > 0 && prevSign < 0) {
        // Linear interpolation for exact crossing point
        const fraction = -samples[i - 1] / (samples[i] - samples[i - 1]);
        upCrossings.push(i - 1 + fraction);
      }
      prevSign = sign;
    }
  }

  // Classify full cycles into bits
  const bits: number[] = [];
  for (let i = 1; i < upCrossings.length; i++) {
    const diffSamples = upCrossings[i] - upCrossings[i - 1];
    const diffMicroseconds = (diffSamples / sampleRate) * 1000000;

    // CoCo FSK Standard:
    // 2400 Hz full cycle (bit 1) => ~416.7 us
    // 1200 Hz full cycle (bit 0) => ~833.3 us
    if (diffMicroseconds >= 300 && diffMicroseconds <= 600) {
      bits.push(1);
    } else if (diffMicroseconds >= 601 && diffMicroseconds <= 1200) {
      bits.push(0);
    }
  }

  if (bits.length < 16) {
    throw new Error('Failed to extract enough FSK bits from audio.');
  }

  // Slide a 1-bit window to find sync marker ($55 followed by $3C)
  let foundSync = false;
  let syncBitIndex = 0;
  let isInverted = false;
  const decodedBytes: number[] = [];

  for (let i = 0; i < bits.length - 16; i++) {
    let byte1 = 0;
    let byte2 = 0;
    for (let b = 0; b < 8; b++) {
      byte1 |= (bits[i + b] << b);
      byte2 |= (bits[i + 8 + b] << b);
    }

    const isNormalLeader = byte1 === 0x55;
    const isInvertedLeader = byte1 === 0xAA;
    const isNormalSync = byte2 === 0x3C;
    const isInvertedSync = byte2 === 0xC3;

    if ((isNormalLeader && isNormalSync) || (isInvertedLeader && isInvertedSync)) {
      foundSync = true;
      syncBitIndex = i;
      isInverted = isInvertedLeader;

      // Extract all bytes starting from the sync byte
      for (let j = i + 8; j < bits.length - 8; j += 8) {
        let byteVal = 0;
        for (let b = 0; b < 8; b++) {
          byteVal |= (bits[j + b] << b);
        }
        if (isInverted) {
          byteVal = (~byteVal) & 0xFF;
        }
        decodedBytes.push(byteVal);
      }
      break;
    }
  }

  if (!foundSync) {
    throw new Error('Could not find CoCo cassette sync marker ($55 $3C) in audio.');
  }

  return {
    metadata: {
      sampleRate,
      bitsPerSample,
      channels,
      dataSize
    },
    bytes: Buffer.from(decodedBytes),
    isInverted,
    syncBitIndex
  };
}
