const crypto = require('crypto');

function secreto() {
  return crypto.randomBytes(48).toString('base64url');
}

console.log('Secretos sugeridos para produccion:\n');
console.log(`JWT_ACCESS_SECRET=${secreto()}`);
console.log(`JWT_REFRESH_SECRET=${secreto()}`);
console.log(`QR_HMAC_SECRET=${secreto()}`);
console.log('\nGuarda estos valores en tu .env de produccion y no los subas al repositorio.');
