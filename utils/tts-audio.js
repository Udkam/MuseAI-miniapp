'use strict'

function invalidWavError(reason) {
  var err = new Error('INVALID_WAV_AUDIO' + (reason ? ': ' + reason : ''))
  err.code = 'INVALID_WAV_AUDIO'
  err.stage = 'validate_wav'
  return err
}

function asUint8Array(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  throw invalidWavError('decoded audio is not binary data')
}

function readUint32LE(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0
}

function chunkIdEquals(bytes, offset, a, b, c, d) {
  return bytes[offset] === a && bytes[offset + 1] === b && bytes[offset + 2] === c && bytes[offset + 3] === d
}

function validateWavArrayBuffer(value) {
  var bytes = asUint8Array(value)
  if (bytes.byteLength < 44) throw invalidWavError('decoded audio is shorter than a playable WAV container')

  var isRiff = chunkIdEquals(bytes, 0, 0x52, 0x49, 0x46, 0x46)
  var isWave = chunkIdEquals(bytes, 8, 0x57, 0x41, 0x56, 0x45)
  if (!isRiff || !isWave) throw invalidWavError('decoded audio must start with RIFF....WAVE')

  var riffEnd = readUint32LE(bytes, 4) + 8
  if (riffEnd < 44 || riffEnd > bytes.byteLength) {
    throw invalidWavError('RIFF declared range is outside the decoded audio')
  }

  var foundFmt = false
  var foundAudio = false
  var offset = 12
  while (offset + 8 <= riffEnd) {
    var chunkSize = readUint32LE(bytes, offset + 4)
    var chunkStart = offset + 8
    var chunkEnd = chunkStart + chunkSize
    if (chunkEnd > riffEnd) throw invalidWavError('WAV chunk exceeds the RIFF declared range')

    if (chunkIdEquals(bytes, offset, 0x66, 0x6d, 0x74, 0x20) && chunkSize >= 16) {
      foundFmt = true
    } else if (chunkIdEquals(bytes, offset, 0x64, 0x61, 0x74, 0x61) && chunkSize > 0) {
      foundAudio = true
    }
    offset = chunkEnd + (chunkSize % 2)
  }

  if (!foundFmt) throw invalidWavError('WAV fmt chunk is missing or shorter than 16 bytes')
  if (!foundAudio) throw invalidWavError('WAV data chunk is missing or empty')
  return value
}

function decodeAndValidateWavBase64(audioBase64, decodeBase64) {
  if (typeof decodeBase64 !== 'function') throw invalidWavError('base64 decoder is unavailable')
  var decoded
  try {
    decoded = decodeBase64(String(audioBase64 || ''))
  } catch (err) {
    throw invalidWavError('base64 decode failed')
  }
  return validateWavArrayBuffer(decoded)
}

module.exports = {
  INVALID_WAV_AUDIO: 'INVALID_WAV_AUDIO',
  invalidWavError: invalidWavError,
  validateWavArrayBuffer: validateWavArrayBuffer,
  decodeAndValidateWavBase64: decodeAndValidateWavBase64,
}
