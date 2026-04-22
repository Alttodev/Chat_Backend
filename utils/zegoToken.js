const { createCipheriv } = require("crypto");

const makeRandomIv = () => {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  const result = [];
  for (let i = 0; i < 16; i += 1) {
    const idx = Math.floor(Math.random() * chars.length);
    result.push(chars.charAt(idx));
  }
  return result.join("");
};

const getAlgorithm = (key) => {
  const keyLength = Buffer.from(key).length;
  if (keyLength === 16) return "aes-128-cbc";
  if (keyLength === 24) return "aes-192-cbc";
  if (keyLength === 32) return "aes-256-cbc";
  throw new Error(`Invalid key length: ${keyLength}`);
};

const aesEncrypt = (plainText, key, iv) => {
  const cipher = createCipheriv(getAlgorithm(key), key, iv);
  cipher.setAutoPadding(true);
  const encrypted = cipher.update(plainText);
  const final = cipher.final();
  return Buffer.concat([encrypted, final]);
};

const generateToken04 = (
  appId,
  userId,
  serverSecret,
  effectiveTimeInSeconds,
  payload = ""
) => {
  if (!appId || Number.isNaN(Number(appId))) {
    throw new Error("Invalid ZEGO app id");
  }
  if (!userId || typeof userId !== "string") {
    throw new Error("Invalid ZEGO user id");
  }
  if (!serverSecret || typeof serverSecret !== "string" || serverSecret.length !== 32) {
    throw new Error("Invalid ZEGO server secret");
  }
  if (!effectiveTimeInSeconds || Number(effectiveTimeInSeconds) <= 0) {
    throw new Error("Invalid token effective time");
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenInfo = {
    app_id: Number(appId),
    user_id: userId,
    nonce: Math.ceil((-2147483648 + (2147483647 - -2147483648)) * Math.random()),
    ctime: now,
    expire: now + Number(effectiveTimeInSeconds),
    payload: payload || "",
  };

  const plainText = JSON.stringify(tokenInfo);
  const iv = makeRandomIv();
  const encrypted = aesEncrypt(plainText, serverSecret, iv);

  const b1 = new Uint8Array(8);
  const b2 = new Uint8Array(2);
  const b3 = new Uint8Array(2);

  new DataView(b1.buffer).setBigInt64(0, BigInt(tokenInfo.expire), false);
  new DataView(b2.buffer).setUint16(0, iv.length, false);
  new DataView(b3.buffer).setUint16(0, encrypted.byteLength, false);

  const tokenBinary = Buffer.concat([
    Buffer.from(b1),
    Buffer.from(b2),
    Buffer.from(iv),
    Buffer.from(b3),
    Buffer.from(encrypted),
  ]);

  return `04${tokenBinary.toString("base64")}`;
};

module.exports = { generateToken04 };
