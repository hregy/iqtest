// Generate a bcrypt hash for the admin password.
// Usage: npm run hash-admin -- 'your-strong-password'
// Put the output in ADMIN_PASSWORD_HASH (and remove ADMIN_PASSWORD).
import bcrypt from "bcryptjs";

const pw = process.argv[2];
if (!pw) {
  console.error("Usage: npm run hash-admin -- 'your-password'");
  process.exit(1);
}
console.log(bcrypt.hashSync(pw, 10));
